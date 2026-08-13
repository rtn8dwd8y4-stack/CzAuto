import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ApplyPage from './pages/apply';
import ApplicationList from './pages/admin/ApplicationList';
import ApplicationDetail from './pages/admin/ApplicationDetail';
import CustomerList from './pages/admin/CustomerList';
import WhitelistSettings from './pages/admin/WhitelistSettings';
import AgentList from './pages/admin/AgentList';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/apply" element={<ApplyPage />} />
        <Route path="/" element={<ApplyPage />} />
        <Route path="/admin" element={<ApplicationList />} />
        <Route path="/admin/:id" element={<ApplicationDetail />} />
        <Route path="/admin/customers" element={<CustomerList />} />
        <Route path="/admin/whitelist" element={<WhitelistSettings />} />
        <Route path="/admin/agents" element={<AgentList />} />
      </Routes>
    </BrowserRouter>
  );
}