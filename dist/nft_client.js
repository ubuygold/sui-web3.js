"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NftClient = exports.parseDomains = exports.NftParser = void 0;
const DEFAULT_NFT_IMAGE = 'ipfs://QmZPWWy5Si54R3d26toaqRiqvCH7HkGdXkxwUgCm2oKKM2?filename=img-sq-01.png';
const NftRegex = /(0x[a-f0-9]{39,40})::nft::Nft<0x[a-f0-9]{39,40}::([a-zA-Z]{1,})::([a-zA-Z]{1,})>/;
const UrlDomainRegex = /0x2::dynamic_field::Field<(0x[a-f0-9]{39,40})::utils::Marker<(0x[a-f0-9]{39,40})::display::UrlDomain>, (0x[a-f0-9]{39,40})::display::UrlDomain>/;
const DisplayDomainRegex = /0x2::dynamic_field::Field<(0x[a-f0-9]{39,40})::utils::Marker<(0x[a-f0-9]{39,40})::display::DisplayDomain>, (0x[a-f0-9]{39,40})::display::DisplayDomain>/;
exports.NftParser = {
    parser: (data, suiData, rpcResponse) => {
        if (typeof rpcResponse.details === 'object' &&
            'data' in rpcResponse.details) {
            const { owner } = rpcResponse.details;
            const matches = suiData.data.type.match(NftRegex);
            if (!matches) {
                return undefined;
            }
            const packageObjectId = matches[1];
            const packageModule = matches[2];
            const packageModuleClassName = matches[3];
            return {
                owner,
                type: suiData.data.dataType,
                id: rpcResponse.details.reference.objectId,
                packageObjectId,
                packageModule,
                packageModuleClassName,
                rawResponse: rpcResponse,
                logicalOwner: data.logical_owner,
                bagId: data.bag.fields.id.id,
            };
        }
        return undefined;
    },
    regex: NftRegex,
};
const isObjectExists = (o) => o.status === 'Exists';
const isTypeMatchRegex = (d, regex) => {
    const { details } = d;
    if (typeof details !== 'string' && 'data' in details)
        if ('data' in details) {
            const { data } = details;
            if ('type' in data) {
                return data.type.match(regex);
            }
        }
    return false;
};
const parseDomains = (domains) => {
    const response = {};
    const urlDomain = domains.find((d) => isTypeMatchRegex(d, UrlDomainRegex));
    const displayDomain = domains.find((d) => isTypeMatchRegex(d, DisplayDomainRegex));
    if (urlDomain &&
        typeof urlDomain !== 'string' &&
        'details' in urlDomain &&
        typeof urlDomain.details !== 'string' &&
        'data' in urlDomain.details &&
        'fields' in urlDomain.details.data) {
        const { data } = urlDomain.details;
        response.url = data.fields.value.fields.url;
    }
    if (displayDomain &&
        typeof displayDomain !== 'string' &&
        'details' in displayDomain &&
        typeof displayDomain.details !== 'string' &&
        'data' in displayDomain.details &&
        'fields' in displayDomain.details.data) {
        const { data } = displayDomain.details;
        response.description = data.fields.value.fields.description;
        response.name = data.fields.value.fields.name;
    }
    return response;
};
exports.parseDomains = parseDomains;
class NftClient {
    constructor(provider) {
        this.parseObjects = async (objects) => {
            const parsedObjects = objects
                .filter(isObjectExists)
                .map((object) => {
                if ('details' in object &&
                    typeof object.details !== 'string' &&
                    'data' in object.details &&
                    'type' in object.details.data &&
                    object.details.data.type.match(exports.NftParser.regex)) {
                    return exports.NftParser.parser(object.details.data.fields, object.details, object);
                }
                return undefined;
            })
                .filter((object) => !!object);
            return parsedObjects;
        };
        this.fetchAndParseObjectsById = async (ids) => {
            if (ids.length === 0) {
                return new Array();
            }
            const objects = await this.provider.getObjectBatch(ids);
            return this.parseObjects(objects);
        };
        this.getBagContent = async (bagId) => {
            const bagObjects = await this.provider.getObjectsOwnedByObject(bagId);
            const objectIds = bagObjects.map((bagObject) => bagObject.objectId);
            return this.provider.getObjectBatch(objectIds);
        };
        this.getNftsById = async (params) => {
            let nfts = [];
            if (params.objectIds) {
                nfts = await this.fetchAndParseObjectsById(params.objectIds);
            }
            else if (params.objects) {
                nfts = await this.parseObjects(params.objects);
            }
            const bags = await Promise.all(nfts.map(async (nft) => {
                const content = await this.getBagContent(nft.bagId);
                return {
                    nftId: nft.id,
                    content: (0, exports.parseDomains)(content),
                };
            }));
            const bagsByNftId = new Map(bags.map((b) => [b.nftId, b]));
            return nfts.map((nft) => {
                const fields = bagsByNftId.get(nft.id);
                return {
                    nft,
                    fields: fields?.content,
                };
            });
        };
        this.provider = provider;
    }
    /**
     * Mint a Example NFT. The wallet address must own enough gas tokens to pay for the transaction.
     *
     * @param signer A signer with connection to the fullnode
     */
    static async mintExampleNFT(signer, name, description, imageUrl) {
        return await signer.executeMoveCall({
            packageObjectId: '0x2',
            module: 'devnet_nft',
            function: 'mint',
            typeArguments: [],
            arguments: [
                name || 'Example NFT',
                description || 'An NFT created by Sui Wallet',
                imageUrl || DEFAULT_NFT_IMAGE,
            ],
            gasBudget: 10000,
        });
    }
    static async TransferNFT(signer, nftId, recipientID, transferCost) {
        return await signer.transferObject({
            objectId: nftId,
            gasBudget: transferCost || 10000,
            recipient: recipientID,
        });
    }
}
exports.NftClient = NftClient;
//# sourceMappingURL=nft_client.js.map