import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ApplicationList from './ApplicationList';
import ApplicationDetail from './ApplicationDetail';
import CustomerList from './CustomerList';
import AgentList from './AgentList';
import WhitelistSettings from './WhitelistSettings';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/admin" replace />} />
        <Route path="/admin" element={<ApplicationList />} />
        <Route path="/admin/:id" element={<ApplicationDetail />} />
        <Route path="/admin/customers" element={<CustomerList />} />
        <Route path="/admin/agents" element={<AgentList />} />
        <Route path="/admin/whitelist" element={<WhitelistSettings />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
