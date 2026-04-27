import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { ApiError } from '../api/client.js';
import { getSafeRedirectPath } from '../utils/permissions.js';
import { createAccessRequest } from '../api/accessRequests.js';
import styles from './LoginPage.module.css';

const EMPTY_RESET = { identifier: '', email: '', note: '' };
const EMPTY_INVITE = { name: '', email: '', company: '', note: '' };

export default function LoginPage() {
  const { login, status, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [activeModal, setActiveModal] = useState(null);
  const [requestLoading, setRequestLoading] = useState(false);
  const [resetForm, setResetForm] = useState(EMPTY_RESET);
  const [inviteForm, setInviteForm] = useState(EMPTY_INVITE);

  const modalTitle = useMemo(() => {
    if (activeModal === 'reset') return 'Redefinir senha';
    if (activeModal === 'invite') return 'Solicitar acesso';
    return '';
  }, [activeModal]);

  useEffect(() => {
    if (status === 'authed') {
      const to = getSafeRedirectPath(user, location.state?.from || '/');
      navigate(to, { replace: true });
    }
  }, [status, navigate, location.state, user]);

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
      const loggedUser = await login({ identifier: id, password });
      const to = getSafeRedirectPath(loggedUser, location.state?.from || '/');
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

  function handleKeyDown(event) {
    if (event.key === 'Enter') handleLogin();
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

  async function handleSubmitRequest() {
    setRequestLoading(true);
    try {
      if (activeModal === 'reset') {
        if (!resetForm.identifier.trim()) {
          throw new Error('Informe o e-mail ou usuário.');
        }

        await createAccessRequest({
          type: 'reset',
          identifier: resetForm.identifier.trim(),
          email: resetForm.email.trim(),
          note: resetForm.note.trim(),
        });
        setNotice('Solicitação registrada.');
      } else if (activeModal === 'invite') {
        if (!inviteForm.name.trim()) throw new Error('Digite seu nome.');
        if (!inviteForm.email.trim()) throw new Error('Digite seu e-mail.');

        await createAccessRequest({
          type: 'invite',
          name: inviteForm.name.trim(),
          email: inviteForm.email.trim(),
          company: inviteForm.company.trim(),
          note: inviteForm.note.trim(),
        });
        setNotice('Solicitação registrada.');
      }
      closeModal();
    } catch (err) {
      setError(err.message || 'Não foi possível registrar a solicitação.');
    } finally {
      setRequestLoading(false);
    }
  }

  return (
    <div className={styles.login}>
      <main className={styles.portal}>
        <aside className={styles.quoteSide}>
          <blockquote>
            Consagre ao Senhor tudo o que você faz, e os seus planos serão bem-sucedidos.
            <cite>Provérbios 16:3</cite>
          </blockquote>
        </aside>

        <section className={styles.formSide}>
          <div className={styles.brandLine}>
            <img src="/brand/logo.png" alt="Edifica" />
          </div>

          <form className={styles.formCard} onSubmit={(event) => { event.preventDefault(); handleLogin(); }}>
            <p className={styles.restrictedText}>Painel restrito para uso interno</p>

            <label className={styles.field}>
              <span>E-mail ou usuário</span>
              <input
                type="text"
                placeholder="seuemail@empresa.com"
                autoComplete="username"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                autoFocus
              />
            </label>

            <label className={styles.field}>
              <span>Senha</span>
              <div className={styles.passwordShell}>
                <input
                  type={showPwd ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((value) => !value)}
                  disabled={loading}
                  aria-label={showPwd ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPwd ? 'ocultar' : 'mostrar'}
                </button>
              </div>
            </label>

            {notice ? <p className={styles.noticeMessage} role="status">{notice}</p> : null}
            {error ? <p className={styles.errorMessage} role="alert">{error}</p> : null}

            <button className={styles.submitButton} type="submit" disabled={loading}>
              {loading ? 'Validando...' : 'Entrar'}
            </button>

            <div className={styles.secondaryActions}>
              <button type="button" onClick={() => openModal('reset')}>
                Esqueci minha senha
              </button>
              <button type="button" onClick={() => openModal('invite')}>
                Solicitar acesso
              </button>
            </div>
          </form>
        </section>
      </main>

      {activeModal ? (
        <div className={styles.modalOverlay} role="presentation" onClick={closeModal}>
          <div
            className={styles.modalCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h3 id="login-modal-title">{modalTitle}</h3>
              <button type="button" onClick={closeModal} aria-label="Fechar janela">×</button>
            </div>

            {activeModal === 'reset' ? (
              <div className={styles.modalBody}>
                <input
                  type="text"
                  placeholder="E-mail ou usuário"
                  value={resetForm.identifier}
                  onChange={(event) => setResetForm((current) => ({ ...current, identifier: event.target.value }))}
                  disabled={requestLoading}
                />
                <input
                  type="email"
                  placeholder="E-mail para retorno"
                  value={resetForm.email}
                  onChange={(event) => setResetForm((current) => ({ ...current, email: event.target.value }))}
                  disabled={requestLoading}
                />
                <textarea
                  placeholder="Observação"
                  value={resetForm.note}
                  onChange={(event) => setResetForm((current) => ({ ...current, note: event.target.value }))}
                  disabled={requestLoading}
                />
              </div>
            ) : (
              <div className={styles.modalBody}>
                <input
                  type="text"
                  placeholder="Nome"
                  value={inviteForm.name}
                  onChange={(event) => setInviteForm((current) => ({ ...current, name: event.target.value }))}
                  disabled={requestLoading}
                />
                <input
                  type="email"
                  placeholder="E-mail"
                  value={inviteForm.email}
                  onChange={(event) => setInviteForm((current) => ({ ...current, email: event.target.value }))}
                  disabled={requestLoading}
                />
                <input
                  type="text"
                  placeholder="Empresa ou área"
                  value={inviteForm.company}
                  onChange={(event) => setInviteForm((current) => ({ ...current, company: event.target.value }))}
                  disabled={requestLoading}
                />
                <textarea
                  placeholder="Observação"
                  value={inviteForm.note}
                  onChange={(event) => setInviteForm((current) => ({ ...current, note: event.target.value }))}
                  disabled={requestLoading}
                />
              </div>
            )}

            <div className={styles.modalActions}>
              <button type="button" onClick={closeModal} disabled={requestLoading}>Cancelar</button>
              <button type="button" onClick={handleSubmitRequest} disabled={requestLoading}>
                {requestLoading ? 'Enviando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
