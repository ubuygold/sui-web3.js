/// <reference types="node" />
import { Ed25519Keypair } from './cryptography/ed25519-keypair';
import { GetObjectDataResponse, SuiAddress, TransactionEffects } from './types';
import { JsonRpcProvider } from './providers/json-rpc-provider';
import { RpcTxnDataSerializer } from './signers/txn-data-serializers/rpc-txn-data-serializer';
import { ObjectId } from './types/objects';
import { NftClient } from './nft_client';
import { SignableTransaction } from './signers/txn-data-serializers/txn-data-serializer';
import { Base64DataBuffer } from './serialization/base64';
export interface AccountMetaData {
    derivationPath: string;
    address: string;
    publicKey?: string;
}
export interface Wallet {
    code: string;
    accounts: AccountMetaData[];
}
export declare class WalletClient {
    provider: JsonRpcProvider;
    serializer: RpcTxnDataSerializer;
    nftClient: NftClient;
    constructor(nodeUrl?: string, faucetUrl?: string);
    /**
     * Creates new account with bip44 path and mnemonics,
     * @param path. (e.g. m/44'/784'/0'/0'/0')
     * Detailed description: {@link https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki}
     * @param mnemonics.
     * @returns Ed25519Keypair
     */
    static fromDerivePath(mnemonics: string, derivationPath?: string): Ed25519Keypair;
    /**
     * returns an Ed25519Keypair object given a private key and
     * address of the account
     *
     * @param privateKey Private key of an account as a Buffer
     * @returns Ed25519Keypair object
     */
    static getAccountFromPrivateKey(privateKey: Buffer): Ed25519Keypair;
    /**
     * Each mnemonic phrase corresponds to a single wallet
     * Wallet can contain multiple accounts
     * An account corresponds to a key pair + address
     *
     * Get all the accounts of a user from their mnemonic phrase
     *
     * @param code The mnemonic phrase (12 word)
     * @returns Wallet object containing all accounts of a user
     */
    importWallet(code: string): Promise<Wallet>;
    /**
     * Creates a new wallet which contains a single account,
     * which is registered on Sui
     *
     * @returns A wallet object
     */
    createWallet(code?: string): Promise<Wallet>;
    /**
     * Creates a new account in the provided wallet
     *
     * @param code mnemonic phrase of the wallet
     * @returns
     */
    createNewAccount(code: string, index: number): Promise<AccountMetaData>;
    transferSuiMnemonic(amount: number, suiAccount: Ed25519Keypair, receiverAddress: SuiAddress, typeArg?: string): Promise<import("./types").SuiExecuteTransactionResponse>;
    getBalance(address: string, typeArg?: string): Promise<bigint>;
    airdrop(address: string): Promise<import("./types").FaucetResponse>;
    getCoinsWithRequiredBalance(address: string, amount: number, typeArg?: string): Promise<string[]>;
    getGasObject(address: string, exclude: ObjectId[]): Promise<string>;
    getCustomCoins(address: string): Promise<{
        Id: string;
        symbol: string;
        name: string;
        balance: number;
        decimals: number;
        coinTypeArg: string;
    }[]>;
    /**
     * Dry run a transaction and return the result.
     * @param address address of the account
     * @param tx the transaction as SignableTransaction or string (in base64) that will dry run
     * @returns The transaction effects
     */
    dryRunTransaction(address: string, tx: SignableTransaction | string | Base64DataBuffer): Promise<TransactionEffects>;
    simulateTransaction(address: string, tx: SignableTransaction | string | Base64DataBuffer): Promise<TransactionEffects>;
    getTransactions(address: SuiAddress): Promise<any[]>;
    getNfts(address: SuiAddress): Promise<GetObjectDataResponse[]>;
    mintNfts(suiAccount: Ed25519Keypair, name?: string, description?: string, imageUrl?: string): Promise<import("./types").SuiExecuteTransactionResponse>;
    transferNft(suiAccount: Ed25519Keypair, nftId: string, recipientID: string): Promise<import("./types").SuiExecuteTransactionResponse>;
    static getAccountFromMetaData(mnemonic: string, metadata: AccountMetaData): any;
}
//# sourceMappingURL=wallet_client.d.ts.map