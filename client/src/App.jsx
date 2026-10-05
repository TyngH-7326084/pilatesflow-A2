import { BrowserRouter, Routes, Route } from "react-router-dom";
import SignupLogin from "./pages/SignupLogin";
import Schedule from "./pages/Schedule";
import AdminDashboard from "./pages/AdminDashboard";
import MyBookings from "./pages/MyBookings";
import ClassBoard from './pages/ClassBoard';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SignupLogin />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/bookings" element={<MyBookings />} />
        <Route path="/class-board" element={<ClassBoard />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;