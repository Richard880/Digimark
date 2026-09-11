
import { Outlet } from 'react-router';

export default function AuthLayout() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4">
      <div className="glass p-8 rounded-2xl shadow-2xl w-full max-w-md border border-white">
        <Outlet />
      </div>
    </div>
  );
}
