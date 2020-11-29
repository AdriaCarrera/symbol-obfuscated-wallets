import {IBlockchainService} from "./IBlockchainService";

export type ObfuscatedAccount<T> = {
    index: number,
    balance: number,
    isUsed: boolean,
    address: string,
    object: T,
}

export type PartialTransaction<T> = {
    destination: string,
    signer: T,
    amount: number,
}

export class ObfuscatedWallet<T> {
    private readonly mnemonic: string;
    private nextDerivationIndex: number;
    private accounts: ObfuscatedAccount<T>[];
    private totalBalance: number;
    protected blockchainService: IBlockchainService<T>;

    constructor(mnemonic: string, blockchainService: IBlockchainService<T>) {
        this.mnemonic = mnemonic;
        this.blockchainService = blockchainService;
        this.accounts = [];
        this.totalBalance = 0;
        this.nextDerivationIndex = 0;
    }

    public info() {
        console.log('Total balance: ' + this.totalBalance);
        console.log('Total accounts: ' + this.accounts.length);
        console.log('Next derivation index: ' + this.nextDerivationIndex);
    }

    public async update() {
        this.accounts = [];
        let index = 0;
        this.totalBalance = 0;
        while (true) {
            const account = await this.blockchainService.getAccountByIndex(this.mnemonic, index);
            if (!account.isUsed) {
                break;
            }
            this.accounts.push(account);
            this.totalBalance += account.balance;
            index++;
        }
        this.nextDerivationIndex = index;
    }

    public async receive(): Promise<T> {
        const account = await this.blockchainService.getAccountByIndex(this.mnemonic, this.nextDerivationIndex);
        return account.object;
    }

    public async send(amount: number, destination: string, fee: number): Promise<boolean> {
        const accounts = this.selectSendAccounts(amount + fee);
        const transactions: PartialTransaction<T>[] = [];
        let totalProcessed = 0;
        for (let i = 0; i < accounts.length - 1; i++) {
            transactions.push({ amount: accounts[i].balance, destination: destination, signer: accounts[i].object });
            totalProcessed += accounts[i].balance;
        }
        const lastAccount = accounts[accounts.length - 1];
        const remainingAmount = amount - totalProcessed;
        // TODO: No residual amount
        if (false && lastAccount.balance === remainingAmount) {
            transactions.push({ amount: lastAccount.balance, destination: destination, signer: lastAccount.object });
        } else {
            const residualAmount = lastAccount.balance - remainingAmount - fee;
            const nextResidualAccount = await this.blockchainService.getAccountByIndex(this.mnemonic, this.nextDerivationIndex);
            // TODO: This may be updated automatically
            this.nextDerivationIndex++;
            transactions.push({ amount: remainingAmount, destination: destination, signer: lastAccount.object });
            transactions.push({ amount: residualAmount, destination: nextResidualAccount.address, signer: lastAccount.object });
        }
        return this.blockchainService.sendTransactions(transactions, fee);
    }

    private selectSendAccounts(amount: number): ObfuscatedAccount<T>[] {
        const accounts = this.accountsSortedByBalance();
        const accountsWithEnoughBalance = accounts.filter(account => account.balance >= amount);
        if (accountsWithEnoughBalance.length > 0) {
            // Case with one it's enough
            return [accountsWithEnoughBalance[accountsWithEnoughBalance.length - 1]];
        }
        //Case we have to pick more than one
        const selectedAccounts: ObfuscatedAccount<T>[] = [];
        let balanceInAccounts = 0;
        let i = 0;
        while (balanceInAccounts < amount) {
            const account = accounts[i];
            balanceInAccounts += account.balance;
            selectedAccounts.push(account);
            i++;
        }
        if (balanceInAccounts < amount) throw new Error('Not enough balance');
        return selectedAccounts;
    }

    private accountsSortedByBalance(): ObfuscatedAccount<T>[] {
        const sortedAccounts = Object.assign([], this.accounts);
        sortedAccounts.sort((a: ObfuscatedAccount<T>, b: ObfuscatedAccount<T>) => {
            return b.balance - a.balance;
        });
        return sortedAccounts
    }
}
