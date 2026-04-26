import { useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import StateBlock from '../components/ui/StateBlock.jsx';

export default function PlaceholderPage({ title, description }) {
  const { setPanelHeader } = useOutletContext();

  useEffect(() => {
    setPanelHeader({
      title: <strong>{title}</strong>,
      actions: null,
    });
  }, [title, setPanelHeader]);

  return (
    <div className="content">
      <StateBlock
        variant="empty"
        title={title || 'Em construção'}
        description={description || 'Esta área ainda será construída.'}
      />
    </div>
  );
}
