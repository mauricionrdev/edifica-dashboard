// ================================================================
//  LoginPage
//  Visual portado 1:1 do LoginView do frontend real (Protocolo de
//  Acesso + painel lateral EDIFICA + modais de reset/invite).
//
//  Integração:
//    - Submit → useAuth().login({ identifier, password })
//    - Sucesso → navigate para a rota de origem ou '/'
//    - Erro → mensagem inline
//
//  Diferenças conscientes vs. o real:
//    - Sem callLegacy / afterLogin / localStorage edifica_curuser.
//    - Sem bootstrap-admin (nosso backend usa seed, não bootstrap via API).
//    - Sem mustChangePassword (a rota /auth/login do backend atual não
//      sinaliza isso; quando sinalizar, adicionamos um fluxo próprio aqui).
//    - Modais "Esqueci senha" / "Solicitar convite" ficam com UI completa
//      mas mostram uma notice informando que a funcionalidade está em
//      breve (backend ainda não tem /access-requests).
//    - Health-check (fetchHealth) removido - era um sinal visual só para
//      instalações novas. Reintroduzimos se fizer diferença no produto.
// ================================================================

import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { ApiError } from '../api/client.js';
import styles from './LoginPage.module.css';

const EMPTY_RESET = { identifier: '', email: '', note: '' };
const EMPTY_INVITE = { name: '', email: '', company: '', note: '' };

export default function LoginPage() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [activeModal, setActiveModal] = useState(null); // 'reset' | 'invite' | null
  const [requestLoading, setRequestLoading] = useState(false);
  const [resetForm, setResetForm] = useState(EMPTY_RESET);
  const [inviteForm, setInviteForm] = useState(EMPTY_INVITE);

  const modalTitle = useMemo(() => {
    if (activeModal === 'reset') return 'Solicitar redefinição de senha';
    if (activeModal === 'invite') return 'Solicitar convite de acesso';
    return '';
  }, [activeModal]);

  // Se já autenticado (ex: veio do histórico), vai pra destino.
  useEffect(() => {
    if (status === 'authed') {
      const to = location.state?.from?.pathname || '/';
      navigate(to, { replace: true });
    }
  }, [status, navigate, location.state]);

  function clearMessages() {
    setError('');
    setNotice('');
  }

  async function handleLogin() {
    const id = identifier.trim();
    if (!id) {
      setNotice('');
      setError('Digite seu e-mail ou nome.');
      return;
    }
    if (!password) {
      setNotice('');
      setError('Digite sua senha.');
      return;
    }

    clearMessages();
    setLoading(true);
    try {
      await login({ identifier: id, password });
      const to = location.state?.from?.pathname || '/';
      navigate(to, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || 'E-mail/nome ou senha incorretos.');
      } else {
        setError('Erro inesperado. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleLogin();
  }

  function openModal(kind) {
    clearMessages();
    setActiveModal(kind);
  }

  function closeModal() {
    setActiveModal(null);
    setResetForm(EMPTY_RESET);
    setInviteForm(EMPTY_INVITE);
    setRequestLoading(false);
  }

  // Handlers de reset/invite: o backend atual não tem rota para essas
  // solicitações. Mantemos a UX preparada, mas só registramos localmente.
  // TODO: plugar em POST /access-requests quando o endpoint existir.
  async function handleSubmitRequest() {
    setRequestLoading(true);
    try {
      if (activeModal === 'reset') {
        if (!resetForm.identifier.trim()) {
          throw new Error('Informe o e-mail ou usuário.');
        }
      } else if (activeModal === 'invite') {
        if (!inviteForm.name.trim()) throw new Error('Digite seu nome.');
        if (!inviteForm.email.trim()) throw new Error('Digite seu e-mail.');
      }

      setNotice(
        'Solicitação registrada. Um administrador entrará em contato assim que a funcionalidade estiver ativa.'
      );
      closeModal();
    } catch (err) {
      setError(err.message || 'Não foi possível registrar a solicitação.');
    } finally {
      setRequestLoading(false);
    }
  }

  return (
    <div className={styles.login}>
      <div className={styles.portal}>
        {/* --- Painel de acesso (esquerda) --- */}
        <section className={styles.accessPanel}>
          <div className={styles.accessInner}>
            <header className={styles.header}>
              <h2 className={styles.eyebrow}>Protocolo de Acesso</h2>
              <div className={styles.eyebrowLine} />
            </header>

            <div className={styles.formBlock}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel} htmlFor="linput">
                  I. E-mail ou Usuário
                </label>
                <div className={styles.fieldShell}>
                  <input
                    className={styles.fieldInput}
                    type="text"
                    id="linput"
                    placeholder="IDENTIFICAÇÃO"
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={loading}
                    autoFocus
                  />
                  <div className={styles.fieldLine} />
                  <div className={styles.fieldFocusLine} />
                </div>
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel} htmlFor="lpwd">
                  II. Senha
                </label>
                <div className={styles.fieldShell}>
                  <input
                    className={styles.fieldInput}
                    type={showPwd ? 'text' : 'password'}
                    id="lpwd"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={loading}
                  />
                  <div className={styles.fieldLine} />
                  <div className={styles.fieldFocusLine} />
                  <button
                    className={styles.fieldToggle}
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    disabled={loading}
                    aria-label={showPwd ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPwd ? 'ocultar' : 'mostrar'}
                  </button>
                </div>
              </div>
            </div>

            {notice && (
              <p className={styles.noticeMessage} role="status">
                {notice}
              </p>
            )}

            {error && (
              <p className={styles.errorMessage} role="alert">
                {error}
              </p>
            )}

            <div className={styles.actions}>
              <button
                className={styles.submitButton}
                type="button"
                onClick={handleLogin}
                disabled={loading}
              >
                {loading ? 'Verificando…' : 'Entrar'}
              </button>

              <div className={styles.secondaryActions}>
                <button
                  className={styles.linkButton}
                  type="button"
                  onClick={() => openModal('reset')}
                >
                  Esqueci minha senha
                </button>
                <div className={styles.inviteBlock}>
                  <button
                    className={styles.inviteButton}
                    type="button"
                    onClick={() => openModal('invite')}
                  >
                    Solicitar Convite
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* --- Painel lateral de marca (direita) --- */}
        <aside className={styles.brandPanel}>
          <div className={styles.brandTop}>
            <div className={styles.brandMark} aria-hidden="true">
              <span className={styles.brandMarkBar} />
              <span className={styles.brandMarkBar} />
              <span className={styles.brandMarkBar} />
            </div>
            <h1 className={styles.brandName}>EDIFICA</h1>
            <p className={styles.brandSub}>Sistema de Gestão Interno</p>
            <div className={styles.seal}>
              <span>
                Acesso
                <br />
                Restrito
              </span>
            </div>
          </div>

          <div className={styles.divider} />

          <div className={styles.quoteBlock}>
            <p className={styles.quoteText}>
              Consagre ao Senhor tudo o que você faz, e os seus planos serão
              bem-sucedidos.
            </p>
            <div className={styles.quoteMeta}>
              <div className={styles.quoteMetaLine} />
              <p className={styles.quoteRef}>Provérbios 16:3</p>
              <div className={styles.quoteMetaLine} />
            </div>
          </div>

          <p className={styles.brandFooter}>Soli Deo Gloria</p>
        </aside>
      </div>

      {/* --- Modais (reset / invite) --- */}
      {activeModal && (
        <div
          className={styles.modalOverlay}
          role="presentation"
          onClick={closeModal}
        >
          <div
            className={styles.modalCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h3 id="login-modal-title" className={styles.modalTitle}>
                {modalTitle}
              </h3>
              <button
                type="button"
                className={styles.modalClose}
                onClick={closeModal}
                aria-label="Fechar janela"
              >
                ×
              </button>
            </div>

            {activeModal === 'reset' ? (
              <div className={styles.modalBody}>
                <p className={styles.modalText}>
                  Registre um pedido de redefinição. O administrador poderá
                  localizar a conta e tratar a solicitação.
                </p>
                <input
                  className={styles.modalInput}
                  type="text"
                  placeholder="E-mail ou usuário"
                  value={resetForm.identifier}
                  onChange={(e) =>
                    setResetForm((c) => ({ ...c, identifier: e.target.value }))
                  }
                  disabled={requestLoading}
                />
                <input
                  className={styles.modalInput}
                  type="email"
                  placeholder="E-mail para retorno (opcional)"
                  value={resetForm.email}
                  onChange={(e) =>
                    setResetForm((c) => ({ ...c, email: e.target.value }))
                  }
                  disabled={requestLoading}
                />
                <textarea
                  className={styles.modalTextarea}
                  placeholder="Observação (opcional)"
                  value={resetForm.note}
                  onChange={(e) =>
                    setResetForm((c) => ({ ...c, note: e.target.value }))
                  }
                  disabled={requestLoading}
                />
              </div>
            ) : (
              <div className={styles.modalBody}>
                <p className={styles.modalText}>
                  Registre um pedido de acesso para que um administrador
                  possa aprovar o convite e concluir o cadastro.
                </p>
                <input
                  className={styles.modalInput}
                  type="text"
                  placeholder="Seu nome"
                  value={inviteForm.name}
                  onChange={(e) =>
                    setInviteForm((c) => ({ ...c, name: e.target.value }))
                  }
                  disabled={requestLoading}
                />
                <input
                  className={styles.modalInput}
                  type="email"
                  placeholder="Seu e-mail"
                  value={inviteForm.email}
                  onChange={(e) =>
                    setInviteForm((c) => ({ ...c, email: e.target.value }))
                  }
                  disabled={requestLoading}
                />
                <input
                  className={styles.modalInput}
                  type="text"
                  placeholder="Empresa ou área (opcional)"
                  value={inviteForm.company}
                  onChange={(e) =>
                    setInviteForm((c) => ({ ...c, company: e.target.value }))
                  }
                  disabled={requestLoading}
                />
                <textarea
                  className={styles.modalTextarea}
                  placeholder="Observação (opcional)"
                  value={inviteForm.note}
                  onChange={(e) =>
                    setInviteForm((c) => ({ ...c, note: e.target.value }))
                  }
                  disabled={requestLoading}
                />
              </div>
            )}

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalSecondaryButton}
                onClick={closeModal}
                disabled={requestLoading}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.modalPrimaryButton}
                onClick={handleSubmitRequest}
                disabled={requestLoading}
              >
                {requestLoading ? 'Enviando…' : 'Registrar solicitação'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
