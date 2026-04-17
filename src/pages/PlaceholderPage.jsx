// ================================================================
//  PlaceholderPage
//  - Rotas ainda não implementadas. Registra título no panelHeader
//    do AppShell (via outlet context) e mostra uma mensagem.
// ================================================================

import { useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';

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
      <div
        style={{
          padding: '40px 24px',
          textAlign: 'center',
          color: 'var(--text-soft, #b1b6c0)',
          fontSize: 13,
        }}
      >
        {description || 'Esta tela ainda será construída.'}
      </div>
    </div>
  );
}
