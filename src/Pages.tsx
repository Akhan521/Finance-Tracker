import { Link } from 'react-router';
import './Pages.css';

// Routes that later tasks build render this calm stand-in.
export function Placeholder({ title, back = '/' }: { title: string; back?: string }) {
  return (
    <main className="page">
      <Link to={back} className="page-back">
        ← Back
      </Link>
      <h1>{title}</h1>
      <p className="page-quiet">This part is coming soon.</p>
    </main>
  );
}
