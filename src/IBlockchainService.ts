import {ObfuscatedAccount, PartialTransaction} from "./ObfuscatedWallet";

export interface IBlockchainService<T> {
    getAccountByIndex(mnemonic: string, index: number): Promise<ObfuscatedAccount<T>>;

    sendTransactions(transactions: PartialTransaction<T>[], fee: number): Promise<boolean>;
}
