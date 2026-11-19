import SignIn from './auth/SignIn';
import { useSession } from './auth/useSession';

// Placeholder: Task 11 builds the real gate and routes.
export default function App() {
  const { session, loading } = useSession();
  if (loading) return null;
  if (!session) return <SignIn />;
  return <p style={{ padding: 24 }}>Signed in.</p>;
}
