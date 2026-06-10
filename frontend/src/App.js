// src/App.js
import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { Briefcase, MapPin, Building2, ExternalLink, RefreshCw } from 'lucide-react';
import './App.css'; 

function App() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch data straight from Supabase
  const fetchJobs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching jobs:', error.message);
    } else {
      setJobs(data);
    }
    setLoading(false);
  };

  // Trigger manual scrape request to local node server
  const triggerManualScrape = async () => {
    setIsRefreshing(true);
    try {
      await fetch('http://localhost:5000/api/scrape-now', { method: 'POST' });
      setTimeout(async () => {
        await fetchJobs();
        setIsRefreshing(false);
      }, 5000); // 5-second buffer to let database finalize
    } catch (err) {
      console.error('Failed to trigger backend scraper:', err);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div>
          <h1>🕒 Real-time MERN & JS Job Feed</h1>
          <p>Tamil Nadu • Bengaluru • Kerala (0-4 Years Exp, Remote/Hybrid)</p>
        </div>
        <button 
          className={`scrape-btn ${isRefreshing ? 'spinning' : ''}`} 
          onClick={triggerManualScrape}
          disabled={isRefreshing}
        >
          <RefreshCw size={16} />
          {isRefreshing ? 'Scraping Live...' : 'Scrape Now'}
        </button>
      </header>

      <div className="stats-bar">
        <span>Total Rows Tracked: <strong>{jobs.length}</strong></span>
      </div>

      {loading ? (
        <div className="loader">Refreshing table elements...</div>
      ) : (
        <div className="table-responsive">
          <table className="job-table">
            <thead>
              <tr>
                <th><Building2 size={16} className="th-icon" /> Company Name</th>
                <th><MapPin size={16} className="th-icon" /> Place</th>
                <th><Briefcase size={16} className="th-icon" /> Job Title</th>
                <th className="text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan="4" className="no-data">No job listings found. Try hitting "Scrape Now".</td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <tr key={job.id}>
                    <td className="company-cell">{job.company}</td>
                    <td>
                      <span className="badge-place">
                        {job.place || 'Remote / Hybrid'}
                      </span>
                    </td>
                    <td className="title-cell">{job.title}</td>
                    <td className="text-center">
                      <a 
                        href={job.url} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="table-action-link"
                      >
                        Apply <ExternalLink size={14} />
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default App;