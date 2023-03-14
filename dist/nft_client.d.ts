import { RawSigner } from './signers/raw-signer';
import { SuiExecuteTransactionResponse } from './types';
import { SuiObject } from './types/objects';
import type { GetObjectDataResponse } from './types/objects';
import { JsonRpcProvider } from './providers/json-rpc-provider';
export interface WithIds {
    objectIds?: string[];
    objects?: any[];
}
declare type FetchFnParser<RpcResponse, DataModel> = (typedData: RpcResponse, suiObject: SuiObject, rpcResponse: GetObjectDataResponse) => DataModel | undefined;
declare type SuiObjectParser<RpcResponse, DataModel> = {
    parser: FetchFnParser<RpcResponse, DataModel>;
    regex: RegExp;
};
declare type ID = {
    id: string;
};
declare type Bag = {
    type: string;
    fields: {
        id: ID;
        size: number;
    };
};
declare type NftRpcResponse = {
    logical_owner: string;
    bag: Bag;
};
declare type NftRaw = {
    id: string;
    logicalOwner: string;
    bagId: string;
};
declare type NftDomains = {
    url: string;
    name: string;
    description: string;
};
export declare type Nft = {
    nft: NftRaw;
    fields?: Partial<NftDomains>;
};
export declare const NftParser: SuiObjectParser<NftRpcResponse, NftRaw>;
export declare const parseDomains: (domains: GetObjectDataResponse[]) => Partial<NftDomains>;
export declare class NftClient {
    private provider;
    constructor(provider: JsonRpcProvider);
    parseObjects: (objects: GetObjectDataResponse[]) => Promise<NftRaw[]>;
    fetchAndParseObjectsById: (ids: string[]) => Promise<NftRaw[]>;
    getBagContent: (bagId: string) => Promise<GetObjectDataResponse[]>;
    getNftsById: (params: WithIds) => Promise<Nft[]>;
    /**
     * Mint a Example NFT. The wallet address must own enough gas tokens to pay for the transaction.
     *
     * @param signer A signer with connection to the fullnode
     */
    static mintExampleNFT(signer: RawSigner, name?: string, description?: string, imageUrl?: string): Promise<SuiExecuteTransactionResponse>;
    static TransferNFT(signer: RawSigner, nftId: string, recipientID: string, transferCost?: number): Promise<SuiExecuteTransactionResponse>;
}
export {};
//# sourceMappingURL=nft_client.d.ts.map