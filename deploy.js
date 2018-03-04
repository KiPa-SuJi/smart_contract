const Web3 = require('web3');
const solc = require('solc');
const fs = require('fs');
const ethabi = require('ethereumjs-abi');
const EthereumTx = require('ethereumjs-tx');
const commandLineArgs = require('command-line-args');
const async = require('async');

const cli = [
  { name: 'help', alias: 'h', type: Boolean },
  { name: 'address', type: String },
  { name: 'admin', type: String },
  { name: 'feeAccount', type: String },
  { name: 'accountLevelsAddr', type: String },
  { name: 'sendImmediately', type: Boolean, defaultValue: false },
  { name: 'privateKey', type: String },
];
const cliOptions = commandLineArgs(cli);

function deploy(web3, compiledContract, args, gas, address, sendImmediately, privateKey) {
  const abi = JSON.parse(compiledContract.interface);
  const bytecode = compiledContract.bytecode;

  if (args.length > 0) {
    const constructTypes = abi
      .filter(x => x.type === 'constructor')[0]
      .inputs.map(x => x.type);
    const abiEncoded = ethabi.rawEncode(constructTypes, args);
    console.log(`ABI encoded constructor arguments: ${abiEncoded.toString('hex')}`);
  }

  const contract = web3.eth.contract(abi);
  const data = `0x${contract.new.getData.apply(null, args.concat({ data: bytecode }))}`;
  if (gas && address && sendImmediately && privateKey) {
    const nonce = web3.toHex(web3.eth.getTransactionCount(address));
    const gasPrice = web3.toHex(web3.eth.gasPrice);
    const gasLimitHex = web3.toHex(gas);
    const rawTx = { nonce, gasPrice, gasLimit: gasLimitHex, from: address, data };
    const tx = new EthereumTx(rawTx);
    const PK = Buffer.from(privateKey, 'hex');
    tx.sign(PK);
    const serializedTx = `0x${tx.serialize().toString('hex')}`;
    web3.eth.sendRawTransaction(serializedTx, (err, txHash) => {
      if (err) {
        console.log(err);
      } else {
        console.log(`txHash: ${txHash}`);
        let contractAddress;
        async.whilst(
          () => !contractAddress,
          (callback) => {
            web3.eth.getTransactionReceipt(txHash, (errReceipt, result) => {
              if (result && result.contractAddress) contractAddress = result.contractAddress;
              setTimeout(() => {
                callback(null);
              }, 10 * 1000);
            });
          },
          (errWhilst) => {
            if (!errWhilst) {
              console.log(contractAddress);
            } else {
              console.log(err);
            }
          },
        );
      }
    });
  } else {
    console.log('Contract data:', data);
  }
}

if (cliOptions.help) {
  console.log(cli);
} else if (
  cliOptions.address && cliOptions.admin && cliOptions.feeAccount && cliOptions.accountLevelsAddr
) {
  const web3 = new Web3();
  web3.setProvider(new web3.providers.HttpProvider('https://rinkeby.infura.io/a24ac7c5484ef4ed0c5eb2d36620ba4e4aa13b8c84684e1b4aab0cebea2ae45cb4d375b77eab56516d34bfbd3c1a833fc51296ff084b770b94fb9028c4d25ccf')); // 'http://localhost:8545'));

  // Config
  const solidityFile = './smart_contract/feelessdelta.sol';
  const contractName = 'FeelessDelta';
  const solcVersion = 'v0.4.9+commit.364da425';
  const address = cliOptions.address;
  const admin = cliOptions.admin;
  const feeAccount = cliOptions.feeAccount;
  const accountLevelsAddr = cliOptions.accountLevelsAddr;
  const feeMake = 0;
  const feeTake = 0;
  const feeRebate = 0;
  const gas = 5000000;
  const args = [admin, feeAccount, accountLevelsAddr, feeMake, feeTake, feeRebate];

  solc.loadRemoteVersion(solcVersion, (err, solcV) => {
    console.log('Solc version:', solcV.version());
    fs.readFile(solidityFile, (errRead, result) => {
      const source = result.toString();
      const output = solcV.compile(source, 1); // 1 activates the optimiser
      if (output.errors) console.log(output.errors);
      const sendImmediately = cliOptions.sendImmediately;
      const privateKey = cliOptions.privateKey;
      deploy(web3, output.contracts[`:${contractName}`], args, gas, address, sendImmediately, privateKey);
    });
  });
}
