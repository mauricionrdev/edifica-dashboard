// ================================================================
//  Topbar
//  Barra superior sticky. A estética principal vem de .tbar no base.css
//  (Stage 17 a refinou: fundo #121212, border-bottom removido, min-height
//  72px, grid-template-columns). Mantemos a mesma estrutura visual do
//  frontend real: tbar-leading (hambúrguer escondido em desktop) +
//  tbar-center (banners inline) + tbar-actions (slot livre).
//
//  Aqui a Topbar não carrega título — o título vive no panelHeader do
//  AppShell (é lá que o visual real coloca). Topbar só guarda banners
//  contextuais e botões de ação fornecidos pelas páginas via slot.
// ================================================================

export default function Topbar({ banner = null, actions = null }) {
  return (
    <header className="tbar">
      <div className="tbar-leading" />

      <div className="tbar-center">
        {banner /* slot para badges contextuais (squad selecionado, etc.) */}
      </div>

      <div className="tbar-actions">
        {actions /* slot para ações globais de topbar */}
      </div>
    </header>
  );
}
