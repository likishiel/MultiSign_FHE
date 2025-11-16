import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface MultiSigData {
  id: string;
  name: string;
  encryptedAmount: string;
  publicValue1: number;
  publicValue2: number;
  description: string;
  creator: string;
  timestamp: number;
  isVerified: boolean;
  decryptedValue: number;
  requiredSignatures: number;
  currentSignatures: number;
  signers: string[];
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [multiSigList, setMultiSigList] = useState<MultiSigData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingMultiSig, setCreatingMultiSig] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending" as const, 
    message: "" 
  });
  const [newMultiSigData, setNewMultiSigData] = useState({ 
    name: "", 
    amount: "", 
    description: "",
    requiredSignatures: "2"
  });
  const [selectedMultiSig, setSelectedMultiSig] = useState<MultiSigData | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;
  const [userHistory, setUserHistory] = useState<string[]>([]);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected) return;
      if (isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const multiSigDataList: MultiSigData[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          multiSigDataList.push({
            id: businessId,
            name: businessData.name,
            encryptedAmount: businessId,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            description: businessData.description,
            creator: businessData.creator,
            timestamp: Number(businessData.timestamp),
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0,
            requiredSignatures: Number(businessData.publicValue1) || 2,
            currentSignatures: Number(businessData.publicValue2) || 0,
            signers: [businessData.creator]
          });
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }
      
      setMultiSigList(multiSigDataList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const createMultiSig = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingMultiSig(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating multi-signature with FHE encryption..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const amountValue = parseInt(newMultiSigData.amount) || 0;
      const businessId = `multisig-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, amountValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newMultiSigData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        parseInt(newMultiSigData.requiredSignatures) || 2,
        0,
        newMultiSigData.description
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setUserHistory(prev => [...prev, `Created multi-signature: ${newMultiSigData.name}`]);
      setTransactionStatus({ visible: true, status: "success", message: "Multi-signature created successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewMultiSigData({ name: "", amount: "", description: "", requiredSignatures: "2" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingMultiSig(false); 
    }
  };

  const decryptData = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        setTransactionStatus({ visible: true, status: "success", message: "Data already verified on-chain" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption on-chain..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      setUserHistory(prev => [...prev, `Decrypted data for: ${businessId}`]);
      setTransactionStatus({ visible: true, status: "success", message: "Data decrypted and verified successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ visible: true, status: "success", message: "Data is already verified on-chain" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        await loadData();
        return null;
      }
      
      setTransactionStatus({ visible: true, status: "error", message: "Decryption failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
  };

  const signMultiSig = async (multiSigId: string) => {
    if (!isConnected || !address) return;
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) return;
      
      setTransactionStatus({ visible: true, status: "pending", message: "Adding signature..." });
      
      const tx = await contract.setData(multiSigId, "signed", 1);
      await tx.wait();
      
      setUserHistory(prev => [...prev, `Signed multi-signature: ${multiSigId}`]);
      setTransactionStatus({ visible: true, status: "success", message: "Signature added successfully!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      await loadData();
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Signing failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const available = await contract.isAvailable();
      setTransactionStatus({ visible: true, status: "success", message: `Contract is available: ${available}` });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Availability check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const filteredMultiSigs = multiSigList.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const paginatedMultiSigs = filteredMultiSigs.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.ceil(filteredMultiSigs.length / itemsPerPage);

  const stats = {
    total: multiSigList.length,
    pending: multiSigList.filter(m => !m.isVerified).length,
    completed: multiSigList.filter(m => m.isVerified).length,
    waiting: multiSigList.filter(m => m.currentSignatures < m.requiredSignatures).length
  };

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>FHE Secure Multi-Sig 🔐</h1>
            <span className="tagline">Privacy-Preserving Multi-Signature Wallet</span>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🔐</div>
            <h2>Connect Your Wallet to Continue</h2>
            <p>Please connect your wallet to initialize the FHE-based multi-signature system.</p>
            <div className="connection-steps">
              <div className="step">
                <span>1</span>
                <p>Connect your wallet</p>
              </div>
              <div className="step">
                <span>2</span>
                <p>FHE system initialization</p>
              </div>
              <div className="step">
                <span>3</span>
                <p>Create and manage encrypted multi-signatures</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE Encryption System...</p>
        <p className="loading-note">Secure multi-signature system loading</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading encrypted multi-signature system...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>FHE Secure Multi-Sig 🔐</h1>
          <span className="tagline">Encrypted Multi-Signature Transactions</span>
        </div>
        
        <div className="header-actions">
          <button onClick={checkAvailability} className="status-btn">Check Status</button>
          <button onClick={() => setShowCreateModal(true)} className="create-btn">+ New Multi-Sig</button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <div className="dashboard-layout">
        <div className="stats-panel">
          <div className="stat-card">
            <div className="stat-icon">📊</div>
            <div className="stat-info">
              <div className="stat-value">{stats.total}</div>
              <div className="stat-label">Total Multi-Sigs</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">⏳</div>
            <div className="stat-info">
              <div className="stat-value">{stats.pending}</div>
              <div className="stat-label">Pending</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">✅</div>
            <div className="stat-info">
              <div className="stat-value">{stats.completed}</div>
              <div className="stat-label">Completed</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">👥</div>
            <div className="stat-info">
              <div className="stat-value">{stats.waiting}</div>
              <div className="stat-label">Waiting Signatures</div>
            </div>
          </div>
        </div>

        <div className="main-content">
          <div className="content-header">
            <h2>Multi-Signature Queue</h2>
            <div className="header-controls">
              <div className="search-box">
                <input 
                  type="text" 
                  placeholder="Search multi-signatures..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <button onClick={loadData} className="refresh-btn" disabled={isRefreshing}>
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>

          <div className="multi-sig-list">
            {paginatedMultiSigs.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🔐</div>
                <p>No multi-signature proposals found</p>
                <button onClick={() => setShowCreateModal(true)} className="create-btn">
                  Create First Multi-Sig
                </button>
              </div>
            ) : (
              paginatedMultiSigs.map((multiSig, index) => (
                <div key={index} className="multi-sig-card">
                  <div className="card-header">
                    <h3>{multiSig.name}</h3>
                    <div className={`status-badge ${multiSig.isVerified ? 'verified' : 'pending'}`}>
                      {multiSig.isVerified ? '✅ Verified' : '⏳ Pending'}
                    </div>
                  </div>
                  <div className="card-content">
                    <p>{multiSig.description}</p>
                    <div className="sig-info">
                      <span>Signatures: {multiSig.currentSignatures}/{multiSig.requiredSignatures}</span>
                      <span>Created: {new Date(multiSig.timestamp * 1000).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="card-actions">
                    <button 
                      onClick={() => signMultiSig(multiSig.id)}
                      className="sign-btn"
                      disabled={multiSig.isVerified}
                    >
                      {multiSig.isVerified ? 'Signed' : 'Add Signature'}
                    </button>
                    <button 
                      onClick={() => decryptData(multiSig.id)}
                      className="decrypt-btn"
                    >
                      {multiSig.isVerified ? 'View Data' : 'Decrypt'}
                    </button>
                    <button onClick={() => setSelectedMultiSig(multiSig)} className="details-btn">
                      Details
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button 
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </button>
              <span>Page {currentPage} of {totalPages}</span>
              <button 
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </button>
            </div>
          )}
        </div>

        <div className="sidebar">
          <div className="history-panel">
            <h3>Operation History</h3>
            <div className="history-list">
              {userHistory.slice(-5).map((item, index) => (
                <div key={index} className="history-item">
                  {item}
                </div>
              ))}
              {userHistory.length === 0 && (
                <div className="no-history">No operations yet</div>
              )}
            </div>
          </div>

          <div className="info-panel">
            <h3>FHE Process</h3>
            <div className="process-step">
              <div className="step-number">1</div>
              <div className="step-content">
                <strong>Data Encryption</strong>
                <p>Transaction amounts encrypted with FHE</p>
              </div>
            </div>
            <div className="process-step">
              <div className="step-number">2</div>
              <div className="step-content">
                <strong>Multi-Signature</strong>
                <p>Multiple signatures required for approval</p>
              </div>
            </div>
            <div className="process-step">
              <div className="step-number">3</div>
              <div className="step-content">
                <strong>Homomorphic Verification</strong>
                <p>Signatures verified without decryption</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showCreateModal && (
        <div className="modal-overlay">
          <div className="create-modal">
            <div className="modal-header">
              <h2>New Multi-Signature</h2>
              <button onClick={() => setShowCreateModal(false)} className="close-btn">×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Multi-Sig Name</label>
                <input 
                  type="text" 
                  value={newMultiSigData.name}
                  onChange={(e) => setNewMultiSigData({...newMultiSigData, name: e.target.value})}
                  placeholder="Enter multi-signature name"
                />
              </div>
              <div className="form-group">
                <label>Amount (FHE Encrypted)</label>
                <input 
                  type="number" 
                  value={newMultiSigData.amount}
                  onChange={(e) => setNewMultiSigData({...newMultiSigData, amount: e.target.value})}
                  placeholder="Enter amount to encrypt"
                />
                <span className="input-hint">Integer only - will be FHE encrypted</span>
              </div>
              <div className="form-group">
                <label>Required Signatures</label>
                <input 
                  type="number" 
                  min="2"
                  max="10"
                  value={newMultiSigData.requiredSignatures}
                  onChange={(e) => setNewMultiSigData({...newMultiSigData, requiredSignatures: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea 
                  value={newMultiSigData.description}
                  onChange={(e) => setNewMultiSigData({...newMultiSigData, description: e.target.value})}
                  placeholder="Enter multi-signature description"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowCreateModal(false)} className="cancel-btn">Cancel</button>
              <button 
                onClick={createMultiSig} 
                disabled={creatingMultiSig || isEncrypting}
                className="submit-btn"
              >
                {creatingMultiSig || isEncrypting ? "Creating..." : "Create Multi-Sig"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedMultiSig && (
        <div className="modal-overlay">
          <div className="detail-modal">
            <div className="modal-header">
              <h2>Multi-Signature Details</h2>
              <button onClick={() => setSelectedMultiSig(null)} className="close-btn">×</button>
            </div>
            <div className="modal-body">
              <div className="detail-grid">
                <div className="detail-item">
                  <label>Name:</label>
                  <span>{selectedMultiSig.name}</span>
                </div>
                <div className="detail-item">
                  <label>Status:</label>
                  <span className={selectedMultiSig.isVerified ? 'verified' : 'pending'}>
                    {selectedMultiSig.isVerified ? 'Verified' : 'Pending Signatures'}
                  </span>
                </div>
                <div className="detail-item">
                  <label>Signatures:</label>
                  <span>{selectedMultiSig.currentSignatures}/{selectedMultiSig.requiredSignatures}</span>
                </div>
                <div className="detail-item">
                  <label>Created:</label>
                  <span>{new Date(selectedMultiSig.timestamp * 1000).toLocaleString()}</span>
                </div>
                <div className="detail-item full-width">
                  <label>Description:</label>
                  <p>{selectedMultiSig.description}</p>
                </div>
                {selectedMultiSig.isVerified && (
                  <div className="detail-item">
                    <label>Decrypted Amount:</label>
                    <span className="decrypted-value">{selectedMultiSig.decryptedValue}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setSelectedMultiSig(null)} className="close-btn">Close</button>
              {!selectedMultiSig.isVerified && (
                <button onClick={() => decryptData(selectedMultiSig.id)} className="decrypt-btn">
                  Decrypt Data
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {transactionStatus.visible && (
        <div className="notification">
          <div className={`notification-content ${transactionStatus.status}`}>
            <div className="notification-icon">
              {transactionStatus.status === "pending" && "⏳"}
              {transactionStatus.status === "success" && "✅"}
              {transactionStatus.status === "error" && "❌"}
            </div>
            <div className="notification-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;


