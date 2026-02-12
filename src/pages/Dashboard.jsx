import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import '../App.css'; 
import logo from '../assets/nomorebugs_logo.png'; 

const Dashboard = ({ onLogout }) => {
  // --- STATE MANAGEMENT ---
  const [activeView, setActiveView] = useState('requests');
  const [userTab, setUserTab] = useState('workers');
  const [selectedManualWorker, setSelectedManualWorker] = useState("");
  // --- REFRESH STATE ---
  const [isRefreshing, setIsRefreshing] = useState(false); 

  // --- DATABASE DATA ---
  const [requests, setRequests] = useState([]); 
  const [workers, setWorkers] = useState([]);
  
  // Stores Paid Customers for Payment Approvals
  const [paidCustomers, setPaidCustomers] = useState([]); 

  // Stores Real Customers from 'users' collection
  const [customers, setCustomers] = useState([]); 

  // --- FORM STATE ---
  const [mailForm, setMailForm] = useState({
      formName: '',
      formAddress: '',
      formDate: '',
      formTime: '',
      formAmPm: 'AM',
      formAmount: '',
      formDescription: '',
      emailTo: '',
      emailSubject: '',
      emailBody: '',
      emailFile: null
  });

 // --- REUSABLE FETCH FUNCTION ---
  const fetchWorkers = () => {
    setIsRefreshing(true); 
    fetch(`http://localhost:3001/get-workers?t=${new Date().getTime()}`)
      .then(res => res.json())
      .then(data => {
        if(Array.isArray(data)) {
            setWorkers(data);
        }
        setIsRefreshing(false);
      })
      .catch(err => {
        console.error("Error fetching workers:", err);
        setIsRefreshing(false);
      });
  };

  // --- FETCH DATA ON LOAD ---
  useEffect(() => {
    fetchWorkers();

    fetch('http://localhost:3001/get-reports')
      .then(res => res.json())
      .then(data => { if(Array.isArray(data)) setRequests(data); })
      .catch(err => console.error("Error fetching requests:", err));

    fetch('http://localhost:3001/get-service-payments')
      .then(res => res.json())
      .then(data => {
        if(Array.isArray(data)) {
            const formattedData = data.map(item => ({
                ...item,
                generatedSlipId: item.transactionId || "N/A", 
                amountInput: item.amount ? item.amount.toString() : '', 
                isEditing: false 
            }));
            setPaidCustomers(formattedData);
        }
      })
      .catch(err => console.error("Error fetching service payments:", err));

    fetch('http://localhost:3001/get-customers')
      .then(res => res.json())
      .then(data => { if(Array.isArray(data)) setCustomers(data); })
      .catch(err => console.error("Error fetching customers:", err));

  }, []);

  // --- MOCK DATA (For Dispatch/Calendar) ---
  const currentDay = 21; 
  const [dispatchQueue, setDispatchQueue] = useState([]);
  const [scheduledJobs, setScheduledJobs] = useState([
    { day: 24, client: 'Old Client', service: 'Garden' }
  ]);
  const [blockedDates, setBlockedDates] = useState([5, 6, 27]); 

  // --- ACTION HANDLERS ---

  const handleDeleteRequest = async (id) => {
      if(!window.confirm("Are you sure you want to delete this request?")) return;
      try {
          await fetch(`http://localhost:3001/delete-report/${id}`, { method: 'DELETE' });
          setRequests(requests.filter(req => req._id !== id));
      } catch (err) {
          console.error(err);
          alert("Error deleting request");
      }
  };

  const handleDone = async (req) => {
    if(!window.confirm(`Mark ${req.username}'s request as Approved?`)) return;

    try {
        const response = await fetch(`http://localhost:3001/update-report-status/${req._id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentStatus: "Approved" })
        });

        const result = await response.json();

        if (result.status === 'ok') {
            setRequests(requests.map(r => r._id === req._id ? { ...r, paymentStatus: "Approved" } : r));
            alert("✅ Request Marked as Approved.");
        } else {
            alert("❌ Error: " + (result.message || "Unknown error"));
        }

    } catch (err) {
        console.error(err);
        alert("Server Error. Check Backend.");
    }
  };

  const handleAmountChange = (id, newVal) => {
    setPaidCustomers(paidCustomers.map(cust => 
        cust._id === id ? { ...cust, amountInput: newVal } : cust
    ));
  };

  const toggleEditMode = (id) => {
    setPaidCustomers(paidCustomers.map(cust => 
        cust._id === id ? { ...cust, isEditing: !cust.isEditing } : cust
    ));
  };

 const handleApprovePayment = async (customer) => {
      if(!customer.amountInput) {
          alert("⚠️ Please enter an Amount before approving.");
          return;
      }

      const originalRequest = requests.find(r => 
          r.email && customer.email && 
          r.email.toLowerCase().trim() === customer.email.toLowerCase().trim()
      ) || {}; 

      const targetPostalCode = originalRequest.postalcode || ""; 
      const targetCity = originalRequest.city || ""; 
      const targetBug = originalRequest.bugType || ""; 

      let assignedWorkerName = null;
      let dispatchStatus = 'Ready for Dispatch';
      
      const matchedWorker = workers.find(worker => {
          if (worker.status !== 'Verified') return false;
          const workerSkills = worker.skills || [];
          const hasSkill = targetBug ? workerSkills.includes(targetBug) : true;
          if (targetBug && !hasSkill) return false; 
          const workerAddress = worker.address ? worker.address.toLowerCase() : "";
          const hasLocation = (targetPostalCode && workerAddress.includes(targetPostalCode)) || 
                              (targetCity && workerAddress.includes(targetCity.toLowerCase()));
          return hasLocation;
      });

      if (matchedWorker) {
          assignedWorkerName = matchedWorker.fullName;
          dispatchStatus = `Auto-Assigned to ${matchedWorker.fullName}`;
      } else {
          dispatchStatus = 'Manual Dispatch Needed (No Skill/Location Match)';
      }

      const payload = {
          slipId: customer.transactionId || "UNKNOWN",
          customerName: customer.customerName,
          email: customer.email,
          amount: customer.amountInput + " LKR", 
          paymentStatus: "Approved"
      };

      try {
          const response = await fetch('http://localhost:3001/approve-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });
          
          const result = await response.json();
          
          if(result.status === 'ok') {
              if(matchedWorker) {
                  alert(`✅ Payment Approved!\n\n✨ MATCH FOUND:\nWorker: ${matchedWorker.fullName}\nSkill: ${targetBug}\nLocation: ${targetCity}`);
              } else {
                  alert(`✅ Payment Approved!\n\n⚠️ No auto-match found for "${targetBug}" in ${targetCity}.\nAdded to Manual Dispatch.`);
              }

              setPaidCustomers(prev => prev.filter(c => c._id !== customer._id));
              
              // 👇 REPLACING ONLY THIS PART TO SAVE ADDRESS & MOBILE 👇
              setDispatchQueue(prev => [...prev, { 
                  reqId: payload.slipId, 
                  customer: payload.customerName, 
                  location: targetCity ? `${targetCity}` : "Unknown Location",
                  
                  // --- NEW DATA ADDED HERE ---
                  fullAddress: originalRequest.address, 
                  postalCode: targetPostalCode,
                  mobile: originalRequest.contactNo,
                  // ---------------------------

                  bug: targetBug || "General Request", 
                  status: dispatchStatus,
                  worker: assignedWorkerName,
                  // We need the worker email for the button later
                  workerEmail: matchedWorker ? matchedWorker.email : "", 
                  isDispatched: false
              }]);

          } else {
              alert("❌ Error from Server: " + result.message);
          }
      } catch (err) {
          console.error("Payment Approval Failed:", err);
          alert("❌ System Error. Check console for details.");
      }
  };

  // --- MAIL & PDF FUNCTIONS ---
  
  const openMailWindow = (req) => {
      setMailForm({
          ...mailForm,
          formName: req.username || '',
          formAddress: req.address || '',
          emailTo: req.email || '',
          emailSubject: 'Quotation from No More Bugs',
          emailBody: `Dear ${req.username},\n\nPlease find the attached quotation for your requested service.\n\nBest Regards,\nNo More Bugs Team`,
      });
      setActiveView('mail_window'); 
  };

  const generatePDF = () => {
    try {
      const doc = new jsPDF();
      
      // Yellow Header (Professional Look)
      doc.setFillColor(255, 215, 0); 
      doc.rect(0, 0, 210, 40, 'F');
      doc.setTextColor(0, 0, 0); 
      doc.setFontSize(22);
      doc.text("NO MORE BUGS - QUOTATION", 105, 25, null, null, "center");
      
      // Customer Details (Text Mode - No Table to prevent crash)
      doc.setFontSize(12);
      let y = 60;
      doc.text(`Customer Name: ${mailForm.formName || 'Valued Customer'}`, 20, y); y += 10;
      doc.text(`Address: ${mailForm.formAddress || 'N/A'}`, 20, y); y += 10;
      doc.text(`Date: ${mailForm.formDate || new Date().toLocaleDateString()}`, 20, y); y += 10;
      doc.text(`Time: ${mailForm.formTime || ''} ${mailForm.formAmPm || ''}`, 20, y); y += 20;
      
      // Amount
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text(`Estimated Amount: ${mailForm.formAmount || '0'} LKR`, 20, y); y += 20;
      
      // Description
      doc.setFontSize(12);
      doc.setFont(undefined, 'normal');
      doc.text("Service Description:", 20, y); y += 10;
      
      const desc = mailForm.formDescription || "General Pest Control Service";
      const splitDesc = doc.splitTextToSize(desc, 170); // Wraps text so it fits
      doc.text(splitDesc, 20, y);

      // Download
      doc.save(`${mailForm.formName || 'Quotation'}.pdf`);
      
    } catch (err) {
      alert("PDF Error: " + err.message);
    }
  };

  const sendRealMail = async (e) => {
      e.preventDefault();
      if(!mailForm.emailTo) return alert("Please enter a recipient email.");

      const formData = new FormData();
      formData.append('to', mailForm.emailTo);
      formData.append('subject', mailForm.emailSubject);
      formData.append('text', mailForm.emailBody);
      if(mailForm.emailFile) formData.append('attachment', mailForm.emailFile);

      try {
          alert("Sending email... Please wait.");
          const response = await fetch('http://localhost:3001/send-email', { method: 'POST', body: formData });
          const result = await response.json();
          if(result.status === 'ok') alert("✅ Email Sent Successfully!");
          else alert("❌ Error Sending Email: " + result.message);
      } catch (err) {
          console.error(err);
          alert("Server Error");
      }
  };

  // --- WORKER & CUSTOMER MANAGEMENT LOGIC ---
  
  const verifyWorker = async (id) => {
    try {
      await fetch(`http://localhost:3001/verify-worker/${id}`, { method: 'PUT' });
      setWorkers(workers.map(w => w._id === id ? { ...w, status: 'Verified' } : w));
    } catch (err) { console.error(err); }
  };

  const fireWorker = async (id) => {
    if(!window.confirm("Fire this worker?")) return;
    try {
      await fetch(`http://localhost:3001/delete-worker/${id}`, { method: 'DELETE' });
      setWorkers(workers.filter(w => w._id !== id));
    } catch (err) { console.error(err); }
  };

  const toggleDate = (day) => {
    const isJob = scheduledJobs.find(j => j.day === day);
    if (isJob) { alert(`Cannot block. Scheduled job: ${isJob.client}`); return; }
    if (blockedDates.includes(day)) { setBlockedDates(blockedDates.filter(d => d !== day)); } 
    else { setBlockedDates([...blockedDates, day]); }
  };
  const nextJob = scheduledJobs.filter(job => job.day >= currentDay).sort((a, b) => a.day - b.day)[0];

  const toggleBanCustomer = async (id, currentStatus) => {
    const newStatus = (currentStatus === 'Active' || !currentStatus) ? 'Banned' : 'Active';
    setCustomers(customers.map(c => c._id === id ? { ...c, status: newStatus } : c));

    try {
        await fetch(`http://localhost:3001/toggle-customer-status/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
    } catch (err) {
        console.error("Error updating status:", err);
        alert("Failed to update status");
    }
  };

 // ---------------------------------------------------------
  // 🚀 HANDLE CONFIRM DISPATCH (CRASH-PROOF VERSION)
  // ---------------------------------------------------------
  const handleConfirmDispatch = async (jobItem) => {
      // 1. Get Worker Details (or use dummy data if missing)
      let workerFullDetails = workers.find(w => w.fullName === jobItem.worker);
      if (!workerFullDetails) {
          // Fallback to prevent crash if worker isn't found
          workerFullDetails = { fullName: jobItem.worker || "Worker", email: "worker@test.com", mobile: "000-000-0000" };
      }

      const randomPin = Math.floor(100000 + Math.random() * 900000).toString();

      // -------------------------------------------------------
      // 📄 GENERATE PDF (TEXT MODE - NO TABLES)
      // -------------------------------------------------------
      try {
          const doc = new jsPDF();
          
          // Green Header Box
          doc.setFillColor(40, 167, 69);
          doc.rect(0, 0, 210, 30, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(22);
          doc.text("SERVICE CONFIRMATION", 105, 20, null, null, "center");

          // The PIN
          doc.setTextColor(0, 0, 0);
          doc.setFontSize(16);
          doc.text("🔐 YOUR SECURITY PIN:", 105, 50, null, null, "center");
          doc.setFontSize(40);
          doc.setTextColor(220, 53, 69); // Red
          doc.text(randomPin, 105, 65, null, null, "center");
          
          // Worker Details (Simple List)
          doc.setFontSize(12);
          doc.setTextColor(0, 0, 0);
          doc.text(`WORKER NAME:   ${workerFullDetails.fullName}`, 20, 90);
          doc.text(`CONTACT NO:    ${workerFullDetails.mobile}`, 20, 105);
          doc.text(`EMAIL:         ${workerFullDetails.email}`, 20, 120);
          
          doc.setFontSize(10);
          doc.setTextColor(100, 100, 100);
          doc.text("(Please show this PIN to the worker when they arrive)", 105, 140, null, null, "center");

          // Save it
          doc.save(`Service_PIN_${jobItem.customer}.pdf`);
      } catch (err) {
          alert("PDF Generation Failed: " + err.message);
          return; // Stop if PDF fails
      }

      // -------------------------------------------------------
      // 💾 SAVE TO DB
      // -------------------------------------------------------
      const payload = {
          pinCode: randomPin,
          workerName: workerFullDetails.fullName,
          workerEmail: workerFullDetails.email,
          customerName: jobItem.customer,
          customerAddress: jobItem.location,
          serviceType: jobItem.bug
      };

      try {
          const response = await fetch('http://localhost:3001/dispatch-job', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });

          if(response.ok) {
              setDispatchQueue(prev => prev.map(item => {
                  if (item.reqId === jobItem.reqId) {
                      return { 
                          ...item, 
                          isDispatched: true, 
                          pin: randomPin, 
                          workerEmail: workerFullDetails.email 
                      };
                  }
                  return item;
              }));
              alert("✅ DISPATCH SUCCESSFUL!\n\n1. PDF Downloaded.\n2. Job Saved to Database.\n3. Now use the email buttons.");
          } else {
              alert("⚠️ Server Error: Could not save job.");
          }
      } catch (err) {
          alert("Network Error: " + err.message);
      }
  };
  // --- RENDER CONTENT ---
  const renderContent = () => {
    switch(activeView) {
      
      case 'requests':
        return (
          <div className="section-container">
            <h1 style={{ color: '#FFD700' }}>New Requests</h1>
            
            <table className="admin-table">
              <thead>
                <tr>
                    <th>Customer Name</th>
                    <th>E-mail</th>
                    <th>Bug Type</th>
                    <th>Location</th>
                    <th>Status</th> 
                    <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {requests.length === 0 ? (
                    <tr><td colSpan="6" style={{textAlign:'center', color:'#888', padding:'20px'}}>No requests found in database.</td></tr>
                ) : (
                    requests.map(req => (
                    <tr key={req._id}>
                        <td>{req.username || "Unknown"}</td>
                        <td>{req.email || "-"}</td>
                        <td>{req.bugType || "-"}</td>
                        <td>
                            {req.city}, {req.postalcode}
                            <div style={{fontSize:'0.8em', color:'#888'}}>{req.address}</div>
                        </td>
                        <td style={{ color: req.paymentStatus === 'Approved' ? '#4CAF50' : '#FF4444', fontWeight: 'bold' }}>
                             {req.paymentStatus === 'Approved' ? 'Approved' : 'Not Approved'}
                        </td>
                        <td>
                            <div style={{display: 'flex', gap: '8px'}}>
                                <button onClick={() => openMailWindow(req)} className="action-btn-small" style={{ backgroundColor: '#28a745', color: 'white', border: 'none' }}>
                                    <i className="fa fa-envelope" style={{marginRight:'5px'}}></i> Send Quote
                                </button>
                                
                                <button onClick={() => handleDone(req)} className="action-btn-small" style={{ backgroundColor: '#007bff', color: 'white', border: 'none' }}>
                                    <i className="fa fa-check" style={{marginRight:'5px'}}></i> Approve Job
                                </button>

                                <button onClick={() => handleDeleteRequest(req._id)} className="action-btn-small" style={{ backgroundColor: '#dc3545', color: 'white', border: 'none' }}>
                                    <i className="fa fa-trash"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        );

      case 'mail_window':
          return (
              <div className="section-container">
                  <button onClick={() => setActiveView('requests')} className="action-btn-small" style={{background:'#444', color:'white', marginBottom:'20px', border:'1px solid #555'}}>
                      ⬅ Back to Requests
                  </button>

                  <h1 style={{ color: '#FFD700' }}>Generate Document & Send Mail</h1>
                  
                  <div style={{display:'flex', gap:'40px', flexWrap:'wrap'}}>
                      {/* LEFT SIDE: PDF GENERATOR */}
                      <div className="mail-form-box" style={{flex:1, minWidth:'300px', background:'#222', padding:'20px', borderRadius:'8px', border:'1px solid #333'}}>
                          <h3 style={{color:'white', marginTop:0, borderBottom:'1px solid #333', paddingBottom:'10px'}}>1. PDF Details</h3>
                          
                          <div className="form-group" style={{marginTop:'15px'}}>
                              <label>Customer Name</label>
                              <input type="text" value={mailForm.formName} onChange={(e) => setMailForm({ ...mailForm, formName: e.target.value })} style={{width:'100%', padding:'8px', background:'#333', border:'1px solid #444', color:'white', borderRadius:'4px'}} />
                          </div>
                          <div className="form-group" style={{marginTop:'15px'}}>
                              <label>Address</label>
                              <input type="text" value={mailForm.formAddress} onChange={(e) => setMailForm({ ...mailForm, formAddress: e.target.value })} style={{width:'100%', padding:'8px', background:'#333', border:'1px solid #444', color:'white', borderRadius:'4px'}} />
                          </div>
                          <div style={{display:'flex', gap:'10px', marginTop:'15px'}}>
                              <div className="form-group" style={{flex:1}}>
                                  <label>Date</label>
                                  <input type="date" value={mailForm.formDate} onChange={(e) => setMailForm({ ...mailForm, formDate: e.target.value })} style={{width:'100%', padding:'8px', background:'#333', border:'1px solid #444', color:'white', borderRadius:'4px'}} />
                              </div>
                              <div className="form-group" style={{flex:1}}>
                                  <label>Time</label>
                                  <div style={{display:'flex'}}>
                                      <input type="text" placeholder="10:00" value={mailForm.formTime} onChange={(e) => setMailForm({ ...mailForm, formTime: e.target.value })} style={{flex:1, padding:'8px', background:'#333', border:'1px solid #444', color:'white', borderTopRightRadius:0, borderBottomRightRadius:0}} />
                                      <select value={mailForm.formAmPm} onChange={(e) => setMailForm({ ...mailForm, formAmPm: e.target.value })} style={{width:'60px', borderTopLeftRadius:0, borderBottomLeftRadius:0, background:'#444', color:'white', border:'1px solid #444'}}>
                                          <option>AM</option><option>PM</option>
                                      </select>
                                  </div>
                              </div>
                          </div>
                          <div className="form-group" style={{marginTop:'15px'}}>
                              <label>Payment Amount (LKR)</label>
                              <input type="number" value={mailForm.formAmount} onChange={(e) => setMailForm({ ...mailForm, formAmount: e.target.value })} style={{width:'100%', padding:'8px', background:'#333', border:'1px solid #444', color:'white', borderRadius:'4px'}} />
                          </div>
                          <div className="form-group" style={{marginTop:'15px'}}>
                              <label>Description</label>
                              <textarea rows="4" value={mailForm.formDescription} onChange={(e) => setMailForm({ ...mailForm, formDescription: e.target.value })} style={{width:'100%', background:'#333', color:'white', border:'1px solid #444', padding:'8px', borderRadius:'4px'}}></textarea>
                          </div>
                          <button onClick={generatePDF} className="action-btn primary-btn" style={{marginTop:'20px', width:'100%', background:'#FFD700', color:'black', fontWeight:'bold', padding:'12px', border:'none', borderRadius:'4px', cursor:'pointer'}}>
                              <i className="fa fa-file-pdf-o"></i> Generate & Download PDF
                          </button>
                      </div>

                      {/* RIGHT SIDE: GMAIL SENDER (FIXED TO USE DIRECT LINK) */}
                      <div className="gmail-box" style={{flex:1, minWidth:'300px', background:'#f2f2f2', padding:'20px', borderRadius:'8px', color:'black', border:'1px solid #ccc'}}>
                          <h3 style={{color:'#d93025', marginTop:0, display:'flex', alignItems:'center', borderBottom:'1px solid #ddd', paddingBottom:'10px'}}>
                              <i className="fa fa-google" style={{marginRight:'10px'}}></i> Gmail Sender
                          </h3>
                          
                          <div style={{marginTop:'20px'}}>
                              <div className="form-group" style={{marginBottom:'15px'}}>
                                  <label style={{color:'#333', fontWeight:'bold', display:'block', marginBottom:'5px'}}>To:</label>
                                  <input type="email" value={mailForm.emailTo} onChange={(e) => setMailForm({ ...mailForm, emailTo: e.target.value })} style={{width:'100%', padding:'10px', background:'white', color:'black', border:'1px solid #ccc', borderRadius:'4px'}} />
                              </div>
                              <div className="form-group" style={{marginBottom:'15px'}}>
                                  <label style={{color:'#333', fontWeight:'bold', display:'block', marginBottom:'5px'}}>Subject:</label>
                                  <input type="text" value={mailForm.emailSubject} onChange={(e) => setMailForm({ ...mailForm, emailSubject: e.target.value })} style={{width:'100%', padding:'10px', background:'white', color:'black', border:'1px solid #ccc', borderRadius:'4px'}} />
                              </div>
                              <div className="form-group" style={{marginBottom:'15px'}}>
                                  <label style={{color:'#333', fontWeight:'bold', display:'block', marginBottom:'5px'}}>Message Body:</label>
                                  <textarea rows="6" value={mailForm.emailBody} onChange={(e) => setMailForm({ ...mailForm, emailBody: e.target.value })} style={{width:'100%', background:'white', color:'black', border:'1px solid #ccc', padding:'10px', borderRadius:'4px'}}></textarea>
                              </div>
                              
                              <div style={{backgroundColor: '#e8f0fe', color: '#1a73e8', padding: '10px', borderRadius: '4px', marginBottom: '15px', fontSize: '14px'}}>
                                  ℹ️ <strong>Step 2:</strong> Click the button below to open Gmail, then drag the downloaded PDF into the email.
                              </div>

                              {/* DIRECT LINK BUTTON - BYPASSES SERVER ERROR */}
                              <a 
                                  href={`https://mail.google.com/mail/?authuser=nomorebugsmails@gmail.com&view=cm&fs=1&to=${mailForm.emailTo}&su=${encodeURIComponent(mailForm.emailSubject)}&body=${encodeURIComponent(mailForm.emailBody)}`}
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  style={{
                                      display: 'block',
                                      width: '100%',
                                      backgroundColor: '#1a73e8', 
                                      color: 'white', 
                                      padding: '12px', 
                                      border: 'none', 
                                      borderRadius: '4px', 
                                      fontWeight: 'bold', 
                                      cursor: 'pointer',
                                      textAlign: 'center',
                                      textDecoration: 'none'
                                  }}
                              >
                                  Open Gmail & Attach PDF 🚀
                              </a>
                          </div>
                      </div>
                  </div>
              </div>
          );

      case 'payments':
        return (
          <div className="section-container">
            <h1 style={{ color: '#FFD700' }}>Payment Approvals</h1>
            {paidCustomers.length === 0 ? (
                <p style={{color:'#888'}}>No pending paid customers found.</p>
            ) : (
              <table className="admin-table">
                <thead>
                    <tr>
                        <th>Slip ID</th>
                        <th>Customer Name</th>
                        <th>E-mail</th>
                        <th>Status</th>
                        <th>Amount (LKR)</th>
                        <th>Decision</th>
                    </tr>
                </thead>
                <tbody>
                  {paidCustomers.map(cust => (
                    <tr key={cust._id}>
                      <td style={{color: '#FFD700', fontWeight:'bold'}}>#{cust.generatedSlipId}</td>
                      <td>{cust.customerName}</td>
                      <td>{cust.email}</td>
                      <td style={{color: '#4CAF50'}}>{cust.paymentStatus}</td>
                      <td>
                          <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                              <input 
                                type="number" 
                                placeholder="Enter Amount" 
                                value={cust.amountInput}
                                onChange={(e) => handleAmountChange(cust._id, e.target.value)}
                                disabled={!cust.isEditing} 
                                style={{
                                    padding: '8px', 
                                    borderRadius: '4px', 
                                    border: '1px solid #444', 
                                    background: cust.isEditing ? '#fff' : '#333', 
                                    color: cust.isEditing ? '#000' : '#aaa',
                                    width: '100px',
                                    cursor: cust.isEditing ? 'text' : 'not-allowed'
                                }}
                              />
                              <button 
                                onClick={() => toggleEditMode(cust._id)}
                                title="Edit Amount"
                                style={{background: 'transparent', border: 'none', color: '#FFD700', cursor: 'pointer', fontSize: '1.2rem'}}
                              >
                                <i className="fa fa-pencil-square-o"></i>
                              </button>
                          </div>
                      </td>
                      <td>
                          <button 
                            onClick={() => handleApprovePayment(cust)} 
                            className="action-btn-small" 
                            style={{backgroundColor: '#4CAF50'}}
                          >
                            Approve
                          </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );

     case 'dispatch':
          return (
            <div className="section-container">
              <h1 style={{ color: '#FFD700' }}>Worker Dispatch Control</h1>
              
              {dispatchQueue.length === 0 ? (
                <div style={{textAlign:'center', padding:'40px', color:'#666'}}>
                  <i className="fa fa-check-circle" style={{fontSize:'3rem', marginBottom:'10px'}}></i>
                  <p>All clear! No jobs waiting for dispatch.</p>
                </div>
              ) : (
                <div className="dispatch-list">
                  {dispatchQueue.map((item, index) => (
                    <div key={index} style={{
                      backgroundColor: '#1e1e1e', 
                      padding: '20px', 
                      marginBottom: '15px', 
                      borderRadius: '10px',
                      borderLeft: item.worker ? '5px solid #4CAF50' : '5px solid #FF9800', 
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
                    }}>
                      
                      {/* LEFT: JOB DETAILS */}
                      <div style={{flex: 1}}>
                        <h3 style={{color: 'white', margin: '0 0 8px 0', fontSize:'1.2rem'}}>
                          {item.customer} 
                          <span style={{fontSize:'0.8rem', color:'#888', fontWeight:'normal', marginLeft:'10px'}}>
                             (Slip #{item.reqId})
                          </span>
                        </h3>
                        <div style={{color: '#aaa', fontSize: '0.9rem', lineHeight:'1.6'}}>
                          <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                            <span>📍 <strong>Location:</strong> <span style={{color:'#FFD700'}}>{item.location || "Unknown"}</span></span>
                            <span>🐛 <strong>Issue:</strong> {item.bug || "General Pest"}</span>
                          </div>
                        </div>
                      </div>

                      {/* RIGHT: ACTION CENTER */}
                      <div style={{textAlign: 'right', minWidth: '300px'}}>
                        
                        {/* SCENARIO A: ALREADY ASSIGNED (SMART MATCH) */}
                        {item.worker ? (
                          <div>
                            <div style={{marginBottom:'10px'}}>
                              <span style={{backgroundColor:'rgba(76, 175, 80, 0.2)', color:'#4CAF50', padding:'5px 10px', borderRadius:'5px', fontSize:'0.8rem', border:'1px solid #4CAF50'}}>
                                ✨ Auto-Assigned
                              </span>
                            </div>
                            <h4 style={{color:'white', margin:'0 0 10px 0'}}>👤 {item.worker}</h4>
                            
                            {/* --- BUTTONS --- */}
                            {!item.isDispatched ? (
                              <button 
                                  style={{
                                      backgroundColor:'#4CAF50', color:'white', border:'none', padding:'8px 15px', borderRadius:'5px', cursor:'pointer', fontWeight:'bold', width: '100%'
                                  }} 
                                  onClick={() => handleConfirmDispatch(item)}
                              >
                                  Confirm Dispatch 🚀
                              </button>
                            ) : (
                              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  
                                  {/* 1. GMAIL LINK FOR CUSTOMER (Specific Account) */}
                                  <a 
                                      href={`https://mail.google.com/mail/?authuser=nomorebugsmails@gmail.com&view=cm&fs=1&to=${item.email || ''}&su=Service%20Confirmation%20-%20PIN%20Code&body=Dear%20${item.customer},%0D%0A%0D%0APLEASE%20SEE%20ATTACHED%20PDF%20FOR%20YOUR%20PIN.%0D%0A%0D%0AThank%20you!`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{ textDecoration: 'none', backgroundColor: '#007bff', color: 'white', padding: '8px', textAlign: 'center', borderRadius: '5px', fontSize: '14px' }}
                                  >
                                      📧 Open Gmail (Customer)
                                  </a>

                                  {/* 2. GMAIL LINK FOR WORKER (Specific Account) */}
                                  <a 
                                      href={`https://mail.google.com/mail/?authuser=nomorebugsmails@gmail.com&view=cm&fs=1&to=${item.workerEmail || ''}&su=NEW%20JOB%20ALERT!&body=Hello%20${item.worker},%0D%0A%0D%0AYOU%20HAVE%20A%20NEW%20JOB!%0D%0A%0D%0ACUSTOMER:%20${item.customer}%0D%0AADDRESS:%20${item.fullAddress || 'N/A'},%20${item.location},%20${item.postalCode || ''}%0D%0APHONE:%20${item.mobile || 'N/A'}%0D%0ASERVICE:%20${item.bug}%0D%0A%0D%0A1.%20Go%20to%20this%20address.%0D%0A2.%20Call%20customer%20if%20needed.%0D%0A3.%20Ask%20for%20PIN.`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{ textDecoration: 'none', backgroundColor: '#17a2b8', color: 'white', padding: '8px', textAlign: 'center', borderRadius: '5px', fontSize: '14px' }}
                                  >
                                      👷 Worker Gmail (With Details)
                                  </a>
                                  
                                  <div style={{color: '#4CAF50', fontSize: '12px', textAlign: 'center', fontWeight: 'bold', marginTop: '5px'}}>✅ Job Active in DB</div>
                              </div>
                            )}

                          </div>
                        ) : (
                          
                        /* SCENARIO B: MANUAL SELECTION NEEDED */
                          <div style={{display:'flex', flexDirection:'column', alignItems:'flex-end'}}>
                             <div style={{marginBottom:'10px'}}>
                              <span style={{backgroundColor:'rgba(255, 152, 0, 0.2)', color:'#FF9800', padding:'5px 10px', borderRadius:'5px', fontSize:'0.8rem', border:'1px solid #FF9800'}}>
                                ⚠️ Manual Action Needed
                              </span>
                            </div>
                            
                            <div style={{display:'flex', gap:'10px'}}>
                              <select 
                                style={{
                                    padding:'8px', 
                                    borderRadius:'5px', 
                                    backgroundColor:'#333', 
                                    color:'white', 
                                    border:'1px solid #555',
                                    outline: 'none'
                                }}
                                onChange={(e) => setSelectedManualWorker(e.target.value)}
                                value={selectedManualWorker}
                              >
                                <option value="">-- Select a Worker --</option>
                                {workers
                                  .filter(w => w.status === 'Verified') 
                                  .map(w => (
                                    <option key={w._id} value={w.fullName}>
                                      {w.fullName} — {w.address ? w.address.split(',')[0] : 'No Loc'}
                                    </option>
                                ))}
                              </select>
                              
                              <button style={{
                                backgroundColor:'#FF9800', color:'white', border:'none', padding:'8px 15px', borderRadius:'5px', cursor:'pointer', fontWeight:'bold'
                              }} onClick={() => {
                                 if(selectedManualWorker) {
                                    const updatedQueue = [...dispatchQueue];
                                    updatedQueue[index].worker = selectedManualWorker;
                                    updatedQueue[index].status = `Manually Assigned to ${selectedManualWorker}`;
                                    setDispatchQueue(updatedQueue);
                                    setSelectedManualWorker(""); // Reset dropdown
                                    alert(`✅ Manually assigned to ${selectedManualWorker}`);
                                 } else {
                                   alert("Please select a worker first!");
                                 }
                              }}>
                                Assign
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                    </div>
                  ))}
                </div>
              )}
            </div>
          );


      case 'users':
        return (
          <div className="section-container">
            <h1 style={{ color: '#FFD700' }}>User Management</h1>
            <div style={{ margin: '20px 0', display: 'flex', alignItems: 'center' }}>
              <button onClick={() => setUserTab('workers')} className={`sub-tab-btn ${userTab === 'workers' ? 'active' : ''}`}>Workers</button>
              <button onClick={() => setUserTab('customers')} className={`sub-tab-btn ${userTab === 'customers' ? 'active' : ''}`}>Customers</button>
              
              <button 
                  onClick={fetchWorkers} 
                  style={{
                      marginLeft: '20px', 
                      padding: '8px 15px',
                      backgroundColor: '#FFD700', 
                      border: 'none',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      color: 'black'
                  }}
              >
                  ↻ Refresh List
              </button>
            </div>

            {userTab === 'workers' && (
              <div className="worker-grid">
                {workers.map(worker => (
                  <div key={worker._id} className="worker-card">
                    <div className="worker-avatar">
                        {worker.profileImage ? (
                            <img src={worker.profileImage} alt="profile" style={{width:'100%', height:'100%', borderRadius:'50%', objectFit:'cover'}} />
                        ) : (
                            <i className="fa fa-user"></i>
                        )}
                    </div>
                    <h3>{worker.fullName}</h3>
                    <p style={{color: '#aaa'}}>{worker.jobPosition || 'General Worker'}</p>
                    <p style={{fontSize: '0.8rem', color: '#666'}}>
                        <i className="fa fa-phone"></i> {worker.mobile}
                    </p>
                    <span className={`status-badge ${worker.status === 'Verified' ? 'green' : 'orange'}`}>
                        {worker.status || 'pending'}
                    </span>
                    <div className="skills-container">
                        {worker.skills && worker.skills.length > 0 ? (
                             worker.skills.map((skill, idx) => <span key={idx} className="skill-tag">{skill}</span>)
                        ) : (
                             <span className="skill-tag" style={{opacity:0.3}}>No Skills</span>
                        )}
                    </div>
                    <div className="card-actions">
                      {worker.status !== 'Verified' && (
                          <button onClick={() => verifyWorker(worker._id)} className="icon-btn verify" title="Verify">
                            <i className="fa fa-check"></i>
                          </button>
                      )}
                      <button onClick={() => fireWorker(worker._id)} className="icon-btn delete" title="Delete">
                        <i className="fa fa-trash"></i>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {userTab === 'customers' && (
              <table className="admin-table">
                <thead><tr><th>Name</th><th>Email</th><th>Password</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>
                  {customers.map(cust => (
                    <tr key={cust._id} style={{opacity: cust.status === 'Banned' ? 0.5 : 1}}>
                      <td>{cust.name}</td>
                      <td>{cust.email}</td>
                      <td style={{fontFamily: 'monospace'}}>{cust.password}</td>
                      <td style={{color: (cust.status === 'Active' || !cust.status) ? '#4CAF50' : '#f44336'}}>
                          {cust.status || 'Active'}
                      </td>
                      <td>
                          <button 
                            onClick={() => toggleBanCustomer(cust._id, cust.status)} 
                            className="action-btn-small" 
                            style={{
                                backgroundColor: (cust.status === 'Active' || !cust.status) ? '#f44336' : '#4CAF50',
                                minWidth: '80px'
                            }}
                          >
                            {(cust.status === 'Active' || !cust.status) ? 'Ban' : 'Activate'}
                          </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );

      default: return <div>Select item</div>;
    }
  };

  // --- MAIN RENDER (SIDEBAR + CONTENT) ---
  return (
    <div className="dashboard-container">
      {/* SIDEBAR NAVIGATION */}
      <aside className="dashboard-sidebar">
        <div className="sidebar-top"><img src={logo} alt="Logo" className="sidebar-logo" /></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '40px' }}>
            <button onClick={() => setActiveView('requests')} className={`menu-btn ${activeView === 'requests' || activeView === 'mail_window' ? 'active' : ''}`}><i className="fa fa-file-text-o"></i></button>
            <button onClick={() => setActiveView('payments')} className={`menu-btn ${activeView === 'payments' ? 'active' : ''}`}><i className="fa fa-credit-card"></i></button>
            <button onClick={() => setActiveView('dispatch')} className={`menu-btn ${activeView === 'dispatch' ? 'active' : ''}`}><i className="fa fa-users"></i></button>
            <button onClick={() => setActiveView('users')} className={`menu-btn ${activeView === 'users' ? 'active' : ''}`}><i className="fa fa-id-card"></i></button>
        </div>
        <div className="sidebar-bottom"><button onClick={onLogout} className="logout-btn"><i className="fa fa-sign-out"></i></button></div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="main-content" style={{ alignItems: 'flex-start', padding: '40px', overflowY: 'auto' }}>
        {renderContent()}
      </main>
    </div>
  );
};

export default Dashboard;