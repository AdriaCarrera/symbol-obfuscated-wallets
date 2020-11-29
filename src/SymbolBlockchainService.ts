import {ObfuscatedAccount, PartialTransaction} from "./ObfuscatedWallet";
import {IBlockchainService} from "./IBlockchainService";
import {
    Account,
    AccountInfo, Address,
    AggregateTransaction, CosignatureSignedTransaction, CosignatureTransaction, Deadline,
    InnerTransaction, Mosaic,
    MosaicId,
    NetworkType, PlainMessage,
    RepositoryFactoryHttp, SignedTransaction, TransactionMapping, TransferTransaction,
    UInt64
} from "symbol-sdk";
import {ExtendedKey, MnemonicPassPhrase, Wallet} from "symbol-hd-wallets";

export class SymbolBlockchainService implements IBlockchainService<Account>{
    public readonly BIP_VERSION = 44;
    public readonly COIN_TYPE = 4343
    public readonly repositoryFactory: RepositoryFactoryHttp;

    constructor(
        public readonly node: string,
        public readonly networkType: NetworkType,
        public readonly mosaicId: string,
        public readonly generationHash: string) {
        this.repositoryFactory = new RepositoryFactoryHttp(node);
    }

    private getAccountFromMnemonicAndIndex(rawMnemonic: string, index: number): Account {
        const mnemonic = new MnemonicPassPhrase(rawMnemonic);
        const seed = mnemonic.toSeed().toString('hex');
        const extKey = ExtendedKey.createFromSeed(seed);
        const wallet = new Wallet(extKey);
        const path = `m/${this.BIP_VERSION}'/${this.COIN_TYPE}'/${index}'/0'/0'`;
        const account = wallet.getChildAccount(path, this.networkType);
        return Account.createFromPrivateKey(account.privateKey, this.networkType);
    };

    async getAccountByIndex(mnemonic: string, index: number): Promise<ObfuscatedAccount<Account>> {
        const account = this.getAccountFromMnemonicAndIndex(mnemonic, index);
        const accountRepository = this.repositoryFactory.createAccountRepository();
        let accountInfo: AccountInfo;
        try {
            accountInfo = await accountRepository.getAccountInfo(account.address).toPromise();
        } catch (e) {
            return {
                index: index,
                balance: 0,
                isUsed: false,
                address: account.address.plain(),
                object: account,
            };
        }
        let balance = 0;
        for (let mosaic of accountInfo.mosaics) {
            if (mosaic.id.toHex() === new MosaicId(this.mosaicId).toHex()) {
                balance = mosaic.amount.compact();
            }
        }
        return {
            index: index,
            balance: balance,
            isUsed: true,
            address: account.address.plain(),
            object: account,
        }
    };

    async sendTransactions(transactions: PartialTransaction<Account>[], fee: number): Promise<boolean> {
        console.log(transactions.map(tx => ({ amount: tx.amount, from: tx.signer.address.plain(), to: tx.destination})));
        const innerTxs = transactions.map(tx => this.partialTransactionToInnerTransaction(tx));
        const aggregateTransaction = AggregateTransaction.createComplete(
            Deadline.create(),
            innerTxs,
            this.networkType,
            [],
            UInt64.fromUint(fee)
        );
        const duplicatedAccounts = transactions.map(tx => tx.signer);
        const accounts = duplicatedAccounts.reduce((acc, account) => {
            return acc.find((it: Account) => it.address.plain() === account.address.plain()) ?
                acc :
                [...acc, account]
        }, []);
        if (accounts.length > 1) {
            const feePayer = accounts[accounts.length - 1];
            const signedTransactionNotComplete = feePayer.sign(aggregateTransaction, this.generationHash);
            const cosignatureSignedTransactions: CosignatureSignedTransaction[] = [];
            for (let i=0; i < accounts.length - 1; i++) {
                const cosignedTransaction = CosignatureTransaction
                    .signTransactionPayload(accounts[i], signedTransactionNotComplete.payload, this.generationHash);
                cosignatureSignedTransactions.push(
                    new CosignatureSignedTransaction(cosignedTransaction.parentHash, cosignedTransaction.signature, cosignedTransaction.signerPublicKey),
                );
            }
            const recreatedAggregateTransactionFromPayload = TransactionMapping
                .createFromPayload(signedTransactionNotComplete.payload) as AggregateTransaction;
            const signedTransactionComplete = feePayer
                .signTransactionGivenSignatures(recreatedAggregateTransactionFromPayload, cosignatureSignedTransactions, this.generationHash);
            return this.announceTransaction(signedTransactionComplete);
        } else {
            const signedTransaction = accounts[0].sign(aggregateTransaction, this.generationHash);
            return this.announceTransaction(signedTransaction);
        }
    }

    private partialTransactionToInnerTransaction(partial: PartialTransaction<Account>): InnerTransaction {
        const mosaic = new Mosaic(new MosaicId(this.mosaicId), UInt64.fromUint(partial.amount));
        const transaction = TransferTransaction.create(
            Deadline.create(),
            Address.createFromRawAddress(partial.destination),
            [mosaic],
            PlainMessage.create(''),
            this.networkType
        );
        return transaction.toAggregate(partial.signer.publicAccount);
    }

    private async announceTransaction(signedTx: SignedTransaction): Promise<boolean> {
        try {
            const transactionRepository = this.repositoryFactory.createTransactionRepository();
            await transactionRepository.announce(signedTx).toPromise();
            return true;
        } catch {
            return false;
        }
    }

}
