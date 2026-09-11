import AuthProvider from "../features/auth/context/AuthProvider";
import AppRoutes from "../routes/AppRoutes"; // <-- Pulls the decoupled routing layer

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
