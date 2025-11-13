pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract MultiSign_FHE is ZamaEthereumConfig {
    struct SignatureRequest {
        address creator;
        uint256 value;
        bytes32 dataHash;
        bool executed;
        uint256 timestamp;
        uint256 threshold;
        uint256 signaturesCount;
    }

    struct Signer {
        address signerAddress;
        bool approved;
    }

    mapping(bytes32 => SignatureRequest) public signatureRequests;
    mapping(bytes32 => mapping(address => bool)) public signatureApprovals;
    mapping(bytes32 => Signer[]) public signersList;

    event SignatureRequestCreated(
        bytes32 indexed requestId,
        address indexed creator,
        uint256 value,
        bytes32 dataHash,
        uint256 threshold
    );
    event SignatureApproved(bytes32 indexed requestId, address indexed signer);
    event TransactionExecuted(bytes32 indexed requestId);

    modifier onlySigner(bytes32 requestId) {
        bool isSigner = false;
        for (uint i = 0; i < signersList[requestId].length; i++) {
            if (signersList[requestId][i].signerAddress == msg.sender) {
                isSigner = true;
                break;
            }
        }
        require(isSigner, "Not authorized signer");
        _;
    }

    constructor() ZamaEthereumConfig() {}

    function createSignatureRequest(
        bytes32 requestId,
        uint256 value,
        bytes32 dataHash,
        address[] calldata signers,
        uint256 threshold
    ) external {
        require(signers.length > 0, "No signers provided");
        require(threshold > 0 && threshold <= signers.length, "Invalid threshold");

        require(signatureRequests[requestId].creator == address(0), "Request already exists");

        signatureRequests[requestId] = SignatureRequest({
            creator: msg.sender,
            value: value,
            dataHash: dataHash,
            executed: false,
            timestamp: block.timestamp,
            threshold: threshold,
            signaturesCount: 0
        });

        for (uint i = 0; i < signers.length; i++) {
            signersList[requestId].push(Signer({
                signerAddress: signers[i],
                approved: false
            }));
        }

        emit SignatureRequestCreated(requestId, msg.sender, value, dataHash, threshold);
    }

    function approveSignature(bytes32 requestId) external onlySigner(requestId) {
        SignatureRequest storage request = signatureRequests[requestId];
        require(!request.executed, "Request already executed");
        require(!signatureApprovals[requestId][msg.sender], "Signature already approved");

        signatureApprovals[requestId][msg.sender] = true;
        request.signaturesCount++;

        for (uint i = 0; i < signersList[requestId].length; i++) {
            if (signersList[requestId][i].signerAddress == msg.sender) {
                signersList[requestId][i].approved = true;
                break;
            }
        }

        emit SignatureApproved(requestId, msg.sender);

        if (request.signaturesCount >= request.threshold) {
            executeTransaction(requestId);
        }
    }

    function executeTransaction(bytes32 requestId) private {
        SignatureRequest storage request = signatureRequests[requestId];
        require(!request.executed, "Request already executed");
        require(request.signaturesCount >= request.threshold, "Threshold not reached");

        request.executed = true;
        // In a real implementation, this would execute the actual transaction
        // using the encrypted value and data hash

        emit TransactionExecuted(requestId);
    }

    function getSignatureRequest(bytes32 requestId) external view returns (
        address creator,
        uint256 value,
        bytes32 dataHash,
        bool executed,
        uint256 timestamp,
        uint256 threshold,
        uint256 signaturesCount
    ) {
        SignatureRequest storage request = signatureRequests[requestId];
        return (
            request.creator,
            request.value,
            request.dataHash,
            request.executed,
            request.timestamp,
            request.threshold,
            request.signaturesCount
        );
    }

    function getSigners(bytes32 requestId) external view returns (Signer[] memory) {
        return signersList[requestId];
    }

    function hasApproved(bytes32 requestId, address signer) external view returns (bool) {
        return signatureApprovals[requestId][signer];
    }
}


