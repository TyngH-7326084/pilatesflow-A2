import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import Navbar from '../components/Navbar';

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

const ClassBoard = () => {
  const [classes, setClasses] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [draggedItem, setDraggedItem] = useState(null);

  const getAuthConfig = () => {
    const token = localStorage.getItem('token');
    return { headers: { Authorization: `Bearer ${token}` } };
  };

  const fetchActiveClasses = async () => {
    try {
      const { data } = await axios.get(`${API}/api/classes`, getAuthConfig());
      setClasses(data);
    } catch (err) {
      setErrorMsg('Error downloading class data.');
    }
  };

  useEffect(() => {
    fetchActiveClasses();
  }, []);

  const executeLaneTransition = async (classId, previousStatus, targetStatus) => {
    if (previousStatus === targetStatus) return;

    const layoutRollbackCheckpoint = [...classes];
    setClasses(prev => prev.map(c => (c._id === classId || c.id === classId) ? { ...c, status: targetStatus } : c));
    setErrorMsg('');

    try {
      const { data } = await axios.post(`${API}/api/classes/${classId}/transition`, { targetStatus }, getAuthConfig());
      const updatedClass = data.class || data;
      setClasses(prev => prev.map(c => (c._id === classId || c.id === classId) ? updatedClass : c));
    } catch (err) {
      const serverValidationMessage = err.response?.data?.error || err.response?.data?.message || 'Transition denied.';
      setErrorMsg(`State Transition Error: ${serverValidationMessage}`);
      setClasses(layoutRollbackCheckpoint);
    }
  };

  const LANES = ['Draft', 'Published', 'Full', 'Cancelled'];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', fontFamily: 'sans-serif' }}>
      <Navbar />

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 16px' }}>
        <header style={{ marginBottom: '24px' }}>
          <Link to="/admin" style={{ display: 'inline-block', color: '#711F71', textDecoration: 'none', fontSize: '14px', fontWeight: 'bold', marginBottom: '12px' }}>
            ← Back to Dashboard
          </Link>
          <h1 style={{ fontSize: '24px', color: '#333', margin: '0' }}>Manage Classes</h1>          
        </header>

        {errorMsg && (
          <div style={{ marginBottom: '24px', padding: '12px 16px', background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: '8px', fontSize: '14px' }}>
            {errorMsg}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', alignItems: 'start' }}>
          {LANES.map(lane => {
            const matchingClasses = classes.filter(c => (c.status || 'Published') === lane);
            return (
              <div 
                key={lane} 
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => executeLaneTransition(draggedItem.id, draggedItem.status, lane)}
                style={{ background: '#fcfbfe', border: '1px solid #e8e5ec', borderRadius: '12px', padding: '16px', minHeight: '500px' }}
              >
                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#711F71', borderBottom: '2px solid #f1eff4', paddingBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{lane}</span>
                  <span style={{ backgroundColor: '#f1eff4', color: '#711F71', padding: '2px 8px', borderRadius: '20px', fontSize: '12px' }}>{matchingClasses.length}</span>
                </h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {matchingClasses.map(c => {
                    const currentId = c._id || c.id;
                    return (
                      <div
                        key={currentId}
                        draggable
                        onDragStart={() => setDraggedItem({ id: currentId, status: c.status || 'Published' })}
                        onDragEnd={() => setDraggedItem(null)}
                        style={{ background: '#ffffff', padding: '16px', borderRadius: '8px', border: '1px solid #ebdfee', cursor: 'grab' }}
                      >
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '15px', color: '#333' }}>{c.className}</h4>
                        <div style={{ fontSize: '12px', color: '#666', lineHeight: '1.5' }}>
                          <div><b>Instructor:</b> {c.instructorName}</div>
                          <div style={{ marginTop: '4px', color: '#a866a8' }}>
                            <b>Capacity:</b> {c.capacity} spots
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ClassBoard;
