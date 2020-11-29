import {Address, NetworkHttp, UInt64} from "symbol-sdk";
import {ObfuscatedWallet} from "./src/ObfuscatedWallet";
import {SymbolBlockchainService} from "./src/SymbolBlockchainService";

const readline = require("readline");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const showInfo = (wallet) => {
    wallet.info();
    askWalletAction(wallet);
}

const update = async (wallet) => {
    await wallet.update();
    wallet.info();
    askWalletAction(wallet);
}

const receive = async (wallet) => {
    const account = await wallet.receive();
    console.log(account.address.pretty());
    askWalletAction(wallet);
}

const send = (wallet) => {
    rl.question("Amount: ", (rawAmount) => {
        const amount = UInt64.fromNumericString(rawAmount);
        rl.question("Recipient: ", (rawAddress) => {
            const recipient = Address.createFromRawAddress(rawAddress);
            wallet.send(amount.compact(), recipient.plain(), 2000000).then(() => {
                console.log('Success!');
                askWalletAction(wallet);
            });
        });
    });
}

const askWalletAction = (wallet) => {
    rl.question("What action? info(i), update(u), receive(r), send(s)\n", function (action) {
        switch (action) {
            case 'i':
                showInfo(wallet);
                break;
            case 'u':
                update(wallet);
                break;
            case 'r':
                receive(wallet);
                break;
            case 's':
                send(wallet);
                break;
            default:
                console.log("Didn't understand");
                askWalletAction(wallet);
                break;
        }
    });
};

const initQuestions = () => {
    console.log('Hello and welcome to obfuscated wallet!')
    rl.question("Enter mnemonic passphrase:\n", function (mnemonic) {
        rl.question("Enter symbol node:\n", function (node) {
            const networkRepo = new NetworkHttp(node);
            networkRepo.getNetworkProperties().toPromise().then(async properties => {
                if (!properties.chain.currencyMosaicId) throw new Error('Badd network config');
                const mosaicId = properties.chain.currencyMosaicId.replace(/0x/g, '').replace(/'/g, '');
                const generationHash = <string>properties.network.generationHashSeed;
                const networkType = await networkRepo.getNetworkType().toPromise();
                const symbolService = new SymbolBlockchainService(node, networkType, mosaicId, generationHash);
                const wallet = new ObfuscatedWallet(mnemonic, symbolService);
                await wallet.update()
                askWalletAction(wallet);
            })
        });
    });
}

initQuestions();
