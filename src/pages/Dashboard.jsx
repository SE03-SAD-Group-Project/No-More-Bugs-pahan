import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import '../App.css'; 
import logo from '../assets/nomorebugs_logo.png'; 

const Dashboard = ({ onLogout }) => {
  // --- STATE MANAGEMENT ---
  const [activeView, setActiveView] = useState('requests');
  const [userTab, setUserTab] = useState('workers'); 

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

  // --- FETCH DATA ON LOAD ---
  useEffect(() => {
    // 1. Fetch Requests
    fetch('http://localhost:3001/get-reports')
      .then(res => res.json())
      .then(data => {
        if(Array.isArray(data)) setRequests(data);
      })
      .catch(err => console.error("Error fetching requests:", err));

    // 2. Fetch Workers
    fetch('http://localhost:3001/get-workers')
      .then(res => res.json())
      .then(data => {
        if(Array.isArray(data)) setWorkers(data);
      })
      .catch(err => console.error("Error fetching workers:", err));

    // 3. Fetch Paid Customers
    fetch('http://localhost:3001/get-paid-customers')
      .then(res => res.json())
      .then(data => {
        if(Array.isArray(data)) {
            const formattedData = data.map(item => ({
                ...item,
                generatedSlipId: Math.floor(10000 + Math.random() * 90000), 
                amountInput: '', 
                isEditing: false 
            }));
            setPaidCustomers(formattedData);
        }
      })
      .catch(err => console.error("Error fetching paid customers:", err));

    // 4. Fetch Real Customers from 'users' collection
    fetch('http://localhost:3001/get-customers')
      .then(res => res.json())
      .then(data => {
        if(Array.isArray(data)) setCustomers(data);
      })
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

  // 🟢 UPDATED HANDLE DONE FUNCTION (Fixes the Refresh Issue)
  const handleDone = async (req) => {
    if(!window.confirm(`Approve ${req.username} and move to Payments?`)) return;

    try {
        const response = await fetch('http://localhost:3001/add-to-paid', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                customerName: req.username,
                email: req.email,
                paymentStatus: "Approved" 
            })
        });

        const result = await response.json();

        if (result.status === 'ok') {
            alert("✅ Job Moved to Payments Tab!");

            // Manually add the new item to the Payment state so it shows up instantly
            const newPaymentItem = {
                _id: Date.now(), // Temporary ID for React key
                customerName: req.username,
                email: req.email,
                paymentStatus: "Approved",
                generatedSlipId: Math.floor(10000 + Math.random() * 90000), 
                amountInput: '',
                isEditing: false
            };

            setPaidCustomers(prev => [...prev, newPaymentItem]);

        } else {
            alert("❌ Error: " + result.message);
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

      const payload = {
          slipId: customer.generatedSlipId.toString(),
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
              alert(`✅ Payment Approved for Slip #${payload.slipId}`);
              setPaidCustomers(paidCustomers.filter(c => c._id !== customer._id));
              setDispatchQueue([...dispatchQueue, { 
                  reqId: payload.slipId, 
                  customer: payload.customerName, 
                  day: '2025-10-28', 
                  status: 'Ready for Dispatch' 
              }]);
          } else {
              alert("❌ Error: " + result.message);
          }
      } catch (err) {
          console.error(err);
          alert("Server Error");
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
    const doc = new jsPDF();
    doc.setFillColor(255, 215, 0); 
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(22);
    doc.text("NO MORE BUGS - OFFICIAL DOCUMENT", 105, 25, null, null, "center");
    
    doc.setFontSize(12);
    let y = 60;
    doc.text(`Customer Name: ${mailForm.formName}`, 20, y); y += 10;
    doc.text(`Address: ${mailForm.formAddress}`, 20, y); y += 10;
    doc.text(`Date: ${mailForm.formDate}`, 20, y); y += 10;
    
    doc.setFontSize(14);
    doc.text(`Estimated Amount: ${mailForm.formAmount} LKR`, 20, y); y += 15;
    
    doc.setFontSize(12);
    doc.text("Description / Services:", 20, y); y += 10;
    const splitDesc = doc.splitTextToSize(mailForm.formDescription, 170);
    doc.text(splitDesc, 20, y);

    doc.save(`${mailForm.formName}_Quotation.pdf`); 
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

  const handleAssignWorker = (jobIndex, workerName) => {
    const updatedQueue = [...dispatchQueue];
    updatedQueue[jobIndex].status = `Assigned to ${workerName}`;
    setDispatchQueue(updatedQueue);
    alert(`Job Sheet PDF sent to ${workerName}.`);
  };

  const toggleDate = (day) => {
    const isJob = scheduledJobs.find(j => j.day === day);
    if (isJob) { alert(`Cannot block. Scheduled job: ${isJob.client}`); return; }
    if (blockedDates.includes(day)) { setBlockedDates(blockedDates.filter(d => d !== day)); } 
    else { setBlockedDates([...blockedDates, day]); }
  };
  const nextJob = scheduledJobs.filter(job => job.day >= currentDay).sort((a, b) => a.day - b.day)[0];

  // Connects to backend to Ban/Unban users
  const toggleBanCustomer = async (id, currentStatus) => {
    const newStatus = (currentStatus === 'Active' || !currentStatus) ? 'Banned' : 'Active';
    
    // Optimistic UI Update 
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
                        <td style={{ color: req.paymentStatus === 'Paid' ? '#4CAF50' : '#FF9800' }}>
                             {req.paymentStatus || 'Pending'}
                        </td>
                        <td>
                            <div style={{display: 'flex', gap: '8px'}}>
                                <button onClick={() => openMailWindow(req)} className="action-btn-small" style={{ backgroundColor: '#28a745', color: 'white', border: 'none' }}>
                                    <i className="fa fa-envelope" style={{marginRight:'5px'}}></i> Send Quote
                                </button>
                                
                                <button onClick={() => handleDone(req)} className="action-btn-small" style={{ backgroundColor: '#007bff', color: 'white', border: 'none' }}>
                                    <i className="fa fa-check" style={{marginRight:'5px'}}></i> Approve Job
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
                      <div className="mail-form-box" style={{flex:1, minWidth:'300px', background:'#222', padding:'20px', borderRadius:'8px', border:'1px solid #333'}}>
                          <h3 style={{color:'white', marginTop:0, borderBottom:'1px solid #333', paddingBottom:'10px'}}>1. PDF Details</h3>
                          
                          <div className="form-group" style={{marginTop:'15px'}}>
                              <label>Customer Name</label>
                              <input 
                                type="text" 
                                value={mailForm.formName} 
                                onChange={(e) => setMailForm({
                                    ...mailForm, 
                                    formName: e.target.value
                                })} 
                                style={{width:'100%', padding:'8px', background:'#333', border:'1px solid #444', color:'white', borderRadius:'4px'}} 
                              />
                          </div>

                          <div className="form-group" style={{marginTop:'15px'}}>
                              <label>Address</label>
                              <input 
                                type="text" 
                                value={mailForm.formAddress} 
                                onChange={(e) => setMailForm({
                                    ...mailForm, 
                                    formAddress: e.target.value
                                })} 
                                style={{width:'100%', padding:'8px', background:'#333', border:'1px solid #444', color:'white', borderRadius:'4px'}} 
                              />
                          </div>

                          <div style={{display:'flex', gap:'10px', marginTop:'15px'}}>
                              <div className="form-group" style={{flex:1}}>
                                  <label>Date</label>
                                  <input 
                                    type="date" 
                                    value={mailForm.formDate} 
                                    onChange={(e) => setMailForm({
                                        ...mailForm, 
                                        formDate: e.target.value
                                    })} 
                                    style={{width:'100%', padding:'8px', background:'#333', border:'1px solid #444', color:'white', borderRadius:'4px'}} 
                                  />
                              </div>
                              <div className="form-group" style={{flex:1}}>
                                  <label>Time</label>
                                  <div style={{display:'flex'}}>
                                      <input 
                                        type="text" 
                                        placeholder="10:00" 
                                        value={mailForm.formTime} 
                                        onChange={(e) => setMailForm({
                                            ...mailForm, 
                                            formTime: e.target.value
                                        })} 
                                        style={{flex:1, padding:'8px', background:'#333', border:'1px solid #444', color:'white', borderTopRightRadius:0, borderBottomRightRadius:0}} 
                                      />
                                      <select 
                                        value={mailForm.formAmPm} 
                                        onChange={(e) => setMailForm({
                                            ...mailForm, 
                                            formAmPm: e.target.value
                                        })} 
                                        style={{width:'60px', borderTopLeftRadius:0, borderBottomLeftRadius:0, background:'#444', color:'white', border:'1px solid #444'}}
                                      >
                                          <option>AM</option><option>PM</option>
                                      </select>
                                  </div>
                              </div>
                          </div>

                          <div className="form-group" style={{marginTop:'15px'}}>
                              <label>Payment Amount (LKR)</label>
                              <input 
                                type="number" 
                                value={mailForm.formAmount} 
                                onChange={(e) => setMailForm({
                                    ...mailForm, 
                                    formAmount: e.target.value
                                })} 
                                style={{width:'100%', padding:'8px', background:'#333', border:'1px solid #444', color:'white', borderRadius:'4px'}} 
                              />
                          </div>

                          <div className="form-group" style={{marginTop:'15px'}}>
                              <label>Description</label>
                              <textarea 
                                rows="4" 
                                value={mailForm.formDescription} 
                                onChange={(e) => setMailForm({
                                    ...mailForm, 
                                    formDescription: e.target.value
                                })} 
                                style={{width:'100%', background:'#333', color:'white', border:'1px solid #444', padding:'8px', borderRadius:'4px'}}
                              ></textarea>
                          </div>

                          <button onClick={generatePDF} className="action-btn primary-btn" style={{marginTop:'20px', width:'100%', background:'#FFD700', color:'black', fontWeight:'bold', padding:'12px', border:'none', borderRadius:'4px', cursor:'pointer'}}>
                              <i className="fa fa-file-pdf-o"></i> Generate & Download PDF
                          </button>
                      </div>

                      <div className="gmail-box" style={{flex:1, minWidth:'300px', background:'#f2f2f2', padding:'20px', borderRadius:'8px', color:'black', border:'1px solid #ccc'}}>
                          <h3 style={{color:'#d93025', marginTop:0, display:'flex', alignItems:'center', borderBottom:'1px solid #ddd', paddingBottom:'10px'}}>
                              <i className="fa fa-google" style={{marginRight:'10px'}}></i> Gmail Sender
                          </h3>
                          <form onSubmit={sendRealMail} style={{marginTop:'20px'}}>
                              <div className="form-group" style={{marginBottom:'15px'}}>
                                  <label style={{color:'#333', fontWeight:'bold', display:'block', marginBottom:'5px'}}>To:</label>
                                  <input 
                                    type="email" 
                                    value={mailForm.emailTo} 
                                    onChange={(e) => setMailForm({
                                        ...mailForm, 
                                        emailTo: e.target.value
                                    })} 
                                    style={{width:'100%', padding:'10px', background:'white', color:'black', border:'1px solid #ccc', borderRadius:'4px'}} 
                                    required 
                                  />
                              </div>
                              <div className="form-group" style={{marginBottom:'15px'}}>
                                  <label style={{color:'#333', fontWeight:'bold', display:'block', marginBottom:'5px'}}>Subject:</label>
                                  <input 
                                    type="text" 
                                    value={mailForm.emailSubject} 
                                    onChange={(e) => setMailForm({
                                        ...mailForm, 
                                        emailSubject: e.target.value
                                    })} 
                                    style={{width:'100%', padding:'10px', background:'white', color:'black', border:'1px solid #ccc', borderRadius:'4px'}} 
                                    required 
                                  />
                              </div>
                              <div className="form-group" style={{marginBottom:'15px'}}>
                                  <label style={{color:'#333', fontWeight:'bold', display:'block', marginBottom:'5px'}}>Message Body:</label>
                                  <textarea 
                                    rows="6" 
                                    value={mailForm.emailBody} 
                                    onChange={(e) => setMailForm({
                                        ...mailForm, 
                                        emailBody: e.target.value
                                    })} 
                                    style={{width:'100%', background:'white', color:'black', border:'1px solid #ccc', padding:'10px', borderRadius:'4px'}} 
                                    required
                                  ></textarea>
                              </div>
                              <div className="form-group" style={{marginBottom:'15px'}}>
                                  <label style={{color:'#333', fontWeight:'bold', display:'block', marginBottom:'5px'}}>Attach File (PDF):</label>
                                  <input 
                                    type="file" 
                                    onChange={(e) => setMailForm({
                                        ...mailForm, 
                                        emailFile: e.target.files[0]
                                    })} 
                                    style={{width:'100%', padding:'10px', background:'white', color:'black', border:'1px solid #ccc', borderRadius:'4px'}} 
                                  />
                              </div>
                              <button type="submit" style={{backgroundColor:'#1a73e8', color:'white', padding:'12px', border:'none', borderRadius:'4px', fontWeight:'bold', cursor:'pointer', width:'100%', marginTop:'10px'}}>
                                  Send Mail 🚀
                              </button>
                          </form>
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
             <h1 style={{ color: '#FFD700' }}>Worker Dispatch</h1>
             {dispatchQueue.length === 0 ? <p style={{color:'#888'}}>No jobs waiting.</p> : (
               dispatchQueue.map((job, index) => (
                 <div key={index} className="dispatch-card">
                   <div style={{display:'flex', justifyContent:'space-between'}}>
                     <span><strong>Client:</strong> {job.customer}</span>
                     <span><strong>Status:</strong> <span style={{color: '#FFD700'}}>{job.status}</span></span>
                   </div>
                   {!job.status.includes('Assigned') && (
                     <div style={{marginTop: '10px'}}>
                       {workers.filter(w => w.status === 'Verified').map(worker => (
                         <button key={worker.id} onClick={() => handleAssignWorker(index, worker.name)} className="worker-btn avail">
                           {worker.name} ({worker.location})
                         </button>
                       ))}
                     </div>
                   )}
                 </div>
               ))
             )}
          </div>
        );

      case 'calendar':
        return (
          <div className="section-container">
            <h1 style={{ color: '#FFD700' }}>Schedule</h1>
            {nextJob && <div className="upcoming-alert">🔔 <strong>Upcoming:</strong> {nextJob.client} on the <strong>{nextJob.day}th</strong>!</div>}
            <div className="calendar-grid">
              {[...Array(30)].map((_, i) => {
                const day = i + 1;
                const isBlocked = blockedDates.includes(day);
                const jobDetails = scheduledJobs.find(j => j.day === day);
                const isToday = day === currentDay;
                let statusClass = 'available';
                let label = ''; 
                if (isBlocked) { statusClass = 'blocked'; label = 'CLOSED'; }
                if (jobDetails) { statusClass = 'has-job'; label = jobDetails.client; }
                if (isToday) { statusClass += ' today'; } 
                return (
                  <div key={day} onClick={() => toggleDate(day)} className={`calendar-day ${statusClass}`}>
                    <span className="day-number">{day}</span>
                    <span className="day-status">{label}</span>
                    {isToday && <span className="today-badge">TODAY</span>}
                  </div>
                );
              })}
            </div>
          </div>
        );

      case 'users':
        return (
          <div className="section-container">
            <h1 style={{ color: '#FFD700' }}>User Management</h1>
            <div style={{ margin: '20px 0' }}>
              <button onClick={() => setUserTab('workers')} className={`sub-tab-btn ${userTab === 'workers' ? 'active' : ''}`}>Workers</button>
              <button onClick={() => setUserTab('customers')} className={`sub-tab-btn ${userTab === 'customers' ? 'active' : ''}`}>Customers</button>
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
            <button onClick={() => setActiveView('calendar')} className={`menu-btn ${activeView === 'calendar' ? 'active' : ''}`}><i className="fa fa-calendar"></i></button>
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