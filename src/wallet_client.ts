import * as bip39 from '@scure/bip39';
import * as english from '@scure/bip39/wordlists/english';
import { Ed25519Keypair } from './cryptography/ed25519-keypair';
import {
  GetObjectDataResponse,
  SuiAddress,
  TransactionEffects,
} from './types';
import { JsonRpcProvider } from './providers/json-rpc-provider';
import { Coin, SUI_TYPE_ARG } from './types/framework';
import { RpcTxnDataSerializer } from './signers/txn-data-serializers/rpc-txn-data-serializer';
import { getMoveObject, getObjectId, ObjectId } from './types/objects';
import { RawSigner } from './signers/raw-signer';
import { NftClient } from './nft_client';
import { Network, NETWORK_TO_API } from './utils/api-endpoints';
import {
  PaySuiTransaction,
  PayTransaction,
  SignableTransaction,
  UnserializedSignableTransaction,
} from './signers/txn-data-serializers/txn-data-serializer';
import { DEFAULT_CLIENT_OPTIONS } from './rpc/websocket-client';
import { Base64DataBuffer } from './serialization/base64';

const COIN_TYPE = 784;
const MAX_ACCOUNTS = 20;
const DEFAULT_GAS_BUDGET_FOR_SUI_TRANSFER = 1000;
const endpoints = NETWORK_TO_API[Network.DEVNET];

const AIRDROP_SENDER = '0xc4173a804406a365e69dfb297d4eaaf002546ebd';

export interface AccountMetaData {
  derivationPath: string; //"44'/784'/1'/0'/0'"
  address: string;
  publicKey?: string;
}

export interface Wallet {
  code: string; // mnemonic
  accounts: AccountMetaData[];
}

export class WalletClient {
  provider: JsonRpcProvider;
  serializer: RpcTxnDataSerializer;
  nftClient: NftClient;

  constructor(
    nodeUrl: string = endpoints.fullNode,
    faucetUrl: string = endpoints.faucet
  ) {
    this.provider = new JsonRpcProvider(nodeUrl, {
      skipDataValidation: true,
      socketOptions: DEFAULT_CLIENT_OPTIONS,
      versionCacheTimoutInSeconds: 600,
      faucetURL: faucetUrl,
    });
    this.serializer = new RpcTxnDataSerializer(nodeUrl);
    this.nftClient = new NftClient(this.provider);
  }

  /**
   * Creates new account with bip44 path and mnemonics,
   * @param path. (e.g. m/44'/784'/0'/0'/0')
   * Detailed description: {@link https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki}
   * @param mnemonics.
   * @returns Ed25519Keypair
   */
  //Use deriveKeypair() in ed25519-keypair.ts
  //Giving error for different derivation path other than standard 0
  static fromDerivePath(
    mnemonics: string,
    derivationPath?: string
  ): Ed25519Keypair {
    // const normalizeMnemonics = mnemonics
    //     .trim()
    //     .split(/\s+/)
    //     .map((part) => part.toLowerCase())
    //     .join(" ");

    // const { key } = derivePath(path, Buffer.from(bip39.mnemonicToSeedSync(normalizeMnemonics)).toString("hex"));

    // return Ed25519Keypair.fromSeed(new Uint8Array(key));
    return Ed25519Keypair.deriveKeypair(mnemonics, derivationPath);
  }

  /**
   * returns an Ed25519Keypair object given a private key and
   * address of the account
   *
   * @param privateKey Private key of an account as a Buffer
   * @returns Ed25519Keypair object
   */
  static getAccountFromPrivateKey(privateKey: Buffer): Ed25519Keypair {
    return Ed25519Keypair.fromSeed(privateKey.slice(0, 32));
  }

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

  async importWallet(code: string): Promise<Wallet> {
    const accountMetaData: AccountMetaData[] = [];
    for (let i = 0; i < MAX_ACCOUNTS; i += 1) {
      /* eslint-disable no-await-in-loop */
      const derivationPath = `m/44'/${COIN_TYPE}'/${i}'/0'/0'`;
      const keypair = WalletClient.fromDerivePath(code, derivationPath);
      const address = keypair.getPublicKey().toSuiAddress();
      const publicKey = Buffer.from(keypair.getPublicKey().toBytes()).toString(
        'hex'
      );
      // check if this account exists on Sui or not
      const response = await this.provider.getObjectsOwnedByAddress(address);
      if (Object.keys(response).length !== 0 || i === 0) {
        accountMetaData.push({
          derivationPath,
          address: address.startsWith('0x') ? address : '0x' + address,
          publicKey: publicKey.startsWith('0x') ? publicKey : '0x' + publicKey,
        });
        // NOTE: breaking because multiple address support is not available currently
      } else {
        break;
      }
      /* eslint-enable no-await-in-loop */
    }
    return { code, accounts: accountMetaData };
  }

  /**
   * Creates a new wallet which contains a single account,
   * which is registered on Sui
   *
   * @returns A wallet object
   */
  async createWallet(code?: string): Promise<Wallet> {
    if (!code) {
      // mnemonic
      code = bip39.generateMnemonic(english.wordlist);
    }
    const accountMetadata = await this.createNewAccount(code, 0);
    return { code, accounts: [accountMetadata] };
  }

  /**
   * Creates a new account in the provided wallet
   *
   * @param code mnemonic phrase of the wallet
   * @returns
   */
  async createNewAccount(
    code: string,
    index: number
  ): Promise<AccountMetaData> {
    if (index >= MAX_ACCOUNTS) {
      throw new Error('Max no. of accounts reached');
    }
    const derivationPath = `m/44'/${COIN_TYPE}'/${index}'/0'/0'`;
    const keypair = WalletClient.fromDerivePath(code, derivationPath);
    const address = keypair.getPublicKey().toSuiAddress();
    const pubKey = Buffer.from(keypair.getPublicKey().toBytes()).toString(
      'hex'
    );
    return {
      derivationPath,
      address: address.startsWith('0x') ? address : '0x' + address,
      publicKey: pubKey.startsWith('0x') ? pubKey : '0x' + pubKey,
    };
  }

  async transferSuiMnemonic(
    amount: number,
    suiAccount: Ed25519Keypair,
    receiverAddress: SuiAddress,
    typeArg: string = SUI_TYPE_ARG
  ) {
    const keypair = suiAccount;
    const senderAddress = keypair.getPublicKey().toSuiAddress();
    if (typeArg === SUI_TYPE_ARG) {
      const coinsNeeded =
        await this.provider.selectCoinSetWithCombinedBalanceGreaterThanOrEqual(
          senderAddress,
          BigInt(amount + DEFAULT_GAS_BUDGET_FOR_SUI_TRANSFER),
          typeArg
        );
      const inputCoins: ObjectId[] = coinsNeeded.map((coin) =>
        getObjectId(coin)
      );
      const recipients: SuiAddress[] = [receiverAddress];
      const amounts: number[] = [amount];
      const payTxn: PaySuiTransaction = {
        inputCoins: inputCoins,
        recipients: recipients,
        amounts: amounts,
        gasBudget: DEFAULT_GAS_BUDGET_FOR_SUI_TRANSFER,
      };
      const signer = new RawSigner(keypair, this.provider, this.serializer);
      return await signer.paySui(payTxn);
    } else {
      const coinsNeeded =
        await this.provider.selectCoinSetWithCombinedBalanceGreaterThanOrEqual(
          senderAddress,
          BigInt(amount),
          typeArg
        );
      const inputCoins: ObjectId[] = coinsNeeded.map((coin) =>
        getObjectId(coin)
      );
      const gasObjId = await this.getGasObject(senderAddress, inputCoins);
      const recipients: SuiAddress[] = [receiverAddress];
      const amounts: number[] = [amount];
      const payTxn: PayTransaction = {
        inputCoins: inputCoins,
        recipients: recipients,
        amounts: amounts,
        gasPayment: gasObjId,
        gasBudget: DEFAULT_GAS_BUDGET_FOR_SUI_TRANSFER,
      };
      const signer = new RawSigner(keypair, this.provider, this.serializer);
      return await signer.pay(payTxn);
    }
  }

  async getBalance(address: string, typeArg: string = SUI_TYPE_ARG) {
    let objects = await this.provider.getCoinBalancesOwnedByAddress(
      address,
      typeArg
    );
    return Coin.totalBalance(objects);
  }

  async airdrop(address: string) {
    return await this.provider.requestSuiFromFaucet(address);
  }

  async getCoinsWithRequiredBalance(
    address: string,
    amount: number,
    typeArg: string = SUI_TYPE_ARG
  ) {
    const coinsNeeded =
      await this.provider.selectCoinSetWithCombinedBalanceGreaterThanOrEqual(
        address,
        BigInt(amount),
        typeArg
      );
    const coins: ObjectId[] = coinsNeeded.map((coin) => getObjectId(coin));
    return coins;
  }

  async getGasObject(address: string, exclude: ObjectId[]) {
    const gasObj = await this.provider.selectCoinsWithBalanceGreaterThanOrEqual(
      address,
      BigInt(DEFAULT_GAS_BUDGET_FOR_SUI_TRANSFER),
      SUI_TYPE_ARG,
      exclude
    );
    if (gasObj.length === 0) {
      throw new Error('Not Enough Gas');
    }
    const gasObjId: ObjectId = getObjectId(gasObj[0]);
    return gasObjId;
  }

  async getCustomCoins(address: string) {
    const objects = await this.provider.getCoinBalancesOwnedByAddress(address);
    const coinIds = objects.map((c) => ({
      Id: Coin.getID(c),
      symbol: Coin.getCoinSymbol(Coin.getCoinTypeArg(c)),
      name: Coin.getCoinSymbol(Coin.getCoinTypeArg(c)),
      balance: Number(Coin.getBalance(c)),
      decimals: 9,
      coinTypeArg: Coin.getCoinTypeArg(c),
    }));
    return coinIds;
  }

  /**
   * Dry run a transaction and return the result.
   * @param address address of the account
   * @param tx the transaction as SignableTransaction or string (in base64) that will dry run
   * @returns The transaction effects
   */
  async dryRunTransaction(
    address: string,
    tx: SignableTransaction | string | Base64DataBuffer
  ): Promise<TransactionEffects> {
    let dryRunTxBytes: string;
    if (typeof tx === 'string') {
      dryRunTxBytes = tx;
    } else if (tx instanceof Base64DataBuffer) {
      dryRunTxBytes = tx.toString();
    } else {
      switch (tx.kind) {
        case 'bytes':
          dryRunTxBytes = new Base64DataBuffer(tx.data).toString();
          break;
        default:
          dryRunTxBytes = (
            await this.serializer.serializeToBytes(address, tx)
          ).toString();
          break;
      }
    }
    return this.provider.dryRunTransaction(dryRunTxBytes);
  }

  async simulateTransaction(
    address: string,
    tx: SignableTransaction | string | Base64DataBuffer
  ): Promise<TransactionEffects> {
    return await this.dryRunTransaction(address, tx);
  }

  async getTransactions(address: SuiAddress) {
    const transactions = await this.provider.getTransactionsForAddress(address);
    const uniqueTransactions = [...new Set(transactions)];

    const finalTransacationsData: any[] = [];
    await Promise.all(
      uniqueTransactions.map(async (digest: string) => {
        const transactionData = await this.provider.getTransactionWithEffects(
          digest
        );

        if (transactionData.effects.status.status === 'success') {
          const events = transactionData.effects.events;
          const coinBalanceReceiveEvents = events?.filter(
            (event: any) =>
              event.coinBalanceChange &&
              event.coinBalanceChange.owner?.AddressOwner === address &&
              event.coinBalanceChange.changeType !== 'Gas' &&
              event.coinBalanceChange.amount >= 0
          );
          const coinBalanceSendEvents = events?.filter(
            (event: any) =>
              event.coinBalanceChange &&
              event.coinBalanceChange.sender === address &&
              event.coinBalanceChange.changeType !== 'Gas' &&
              event.coinBalanceChange.changeType !== 'Pay'
          );

          const transferEvents: any = events?.filter(
            (event: any) => event.transferObject
          );
          const moveEvents: any = events?.filter(
            (event: any) => event.moveEvent
          );

          let totalCoinBalanceChange: number = 0;
          let changeType: any = {
            type: '',
            from: '',
            to: '',
            resourceType: '',
            changeTextSuffix: '',
          };

          coinBalanceReceiveEvents?.forEach((event: any) => {
            totalCoinBalanceChange += event.coinBalanceChange.amount;
            if (!changeType.type) {
              if (event.coinBalanceChange.sender === AIRDROP_SENDER) {
                changeType = {
                  type: 'Receive',
                  text: 'Airdrop',
                  from: event.coinBalanceChange.sender,
                  to: event.coinBalanceChange.owner?.AddressOwner,
                  resourceType: event.coinBalanceChange.coinType,
                  changeTextSuffix:
                    ' ' + event.coinBalanceChange.coinType?.split('::')[2],
                };
              } else {
                changeType = {
                  type: 'Receive',
                  text: 'Received',
                  from: event.coinBalanceChange.sender,
                  to: event.coinBalanceChange.owner?.AddressOwner,
                  resourceType: event.coinBalanceChange.coinType,
                  changeTextSuffix:
                    ' ' + event.coinBalanceChange.coinType?.split('::')[2],
                };
              }
            }
          });

          coinBalanceSendEvents?.forEach((event: any) => {
            totalCoinBalanceChange += event.coinBalanceChange.amount;
            if (!changeType.type) {
              changeType = {
                type: 'Send',
                text: 'Sent',
                from: event.coinBalanceChange.sender,
                to: event.coinBalanceChange.owner?.AddressOwner,
                resourceType: event.coinBalanceChange.coinType,
                changeTextSuffix:
                  ' ' + event.coinBalanceChange.coinType?.split('::')[2],
              };
            }
          });

          await Promise.all(
            transferEvents?.map(async (event: any) => {
              if (
                event.transferObject.objectType === '0x2::devnet_nft::DevNetNFT'
              ) {
                const nftData = await this.provider.getObject(
                  event.transferObject.objectId
                );

                const nftDetails: any = nftData.details;
                changeType = {
                  nftData: nftDetails,
                  type:
                    event.transferObject.recipient?.AddressOwner === address
                      ? 'Receive'
                      : 'Send',
                  text:
                    event.transferObject.recipient?.AddressOwner === address
                      ? 'NFT Received'
                      : 'NFT Sent',
                  from: event.transferObject.sender,
                  to: event.transferObject.recipient?.AddressOwner,
                  resourceType: event.transferObject.objectType,
                  changeTextSuffix: ` ${nftDetails?.data?.fields?.name}`,
                };
                totalCoinBalanceChange =
                  event.transferObject.recipient?.AddressOwner === address
                    ? 1
                    : -1;
              }
            })
          );

          await Promise.all(
            moveEvents?.map(async (event: any) => {
              if (event.moveEvent.type === '0x2::devnet_nft::MintNFTEvent') {
                const nftData = await this.provider.getObject(
                  event.moveEvent.fields.object_id
                );

                const nftDetails: any = nftData.details;
                changeType = {
                  nftData: nftDetails,
                  type: 'Receive',
                  text: 'NFT Minted',
                  resourceType: event.moveEvent.type,
                  changeTextSuffix: ` ${nftDetails?.data?.fields?.name}`,
                };
                totalCoinBalanceChange = 1;
              }
            })
          );

          const timestamp: any = transactionData.timestamp_ms;

          finalTransacationsData.push({
            ...transactionData,
            totalCoinBalanceChange,
            changeType,
            date: new Date(timestamp).toLocaleDateString('en-GB', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            }),
          });
        }
      })
    );

    finalTransacationsData.sort((a, b) => b.timestamp_ms - a.timestamp_ms);

    return finalTransacationsData;
  }

  async getNfts(address: SuiAddress) {
    let objects = await this.provider.getObjectsOwnedByAddress(address);
    var nfts: GetObjectDataResponse[] = [];
    const originByteNftData = [];
    await Promise.all(
      objects.map(async (obj) => {
        let objData = await this.provider.getObject(obj.objectId);

        if (!objData) return;

        const objectDetails = objData.details;

        if (
          typeof objectDetails !== 'string' &&
          'data' in objectDetails &&
          'fields' in objectDetails.data
        ) {
          if (objectDetails.data.fields.bag) {
            // originbyte nft standard
            originByteNftData.push(objData);
            return;
          }
        }

        let moveObj = getMoveObject(objData);
        if (!Coin.isCoin(objData) && moveObj!.fields.url) {
          nfts.push(objData);
        } else if (moveObj!.fields.metadata) {
          nfts.push(objData);
        }
      })
    );

    // fetch originbyte nfts
    const originByteNfts = await this.nftClient.getNftsById({
      objects: originByteNftData,
    });

    originByteNfts.map((data) => {
      try {
        let obj: any = originByteNftData.filter(
          (val) => val.details.reference.objectId === data.nft.id
        );

        if (obj.length === 0) return;

        obj = obj[0];

        obj.details.data.fields = {
          ...obj.details.data.fields,
          ...data.fields,
        };
        nfts.push(obj);
      } catch (err) {
        console.log(err);
      }
    });

    return nfts;
  }

  async mintNfts(
    suiAccount: Ed25519Keypair,
    name?: string,
    description?: string,
    imageUrl?: string
  ) {
    const keypair = suiAccount;
    const accountSigner = new RawSigner(
      keypair,
      this.provider,
      this.serializer
    );
    const mintedNft = NftClient.mintExampleNFT(
      accountSigner,
      name,
      description,
      imageUrl
    );
    return mintedNft;
  }

  async transferNft(
    suiAccount: Ed25519Keypair,
    nftId: string,
    recipientID: string
  ) {
    const keypair = suiAccount;
    const accountSigner = new RawSigner(
      keypair,
      this.provider,
      this.serializer
    );
    const mintedNft = NftClient.TransferNFT(accountSigner, nftId, recipientID);
    return mintedNft;
  }

  static getAccountFromMetaData(mnemonic: string, metadata: AccountMetaData) {
    const keypair: any = Ed25519Keypair.deriveKeypair(
      mnemonic,
      metadata.derivationPath
    );
    return keypair;
  }
}
