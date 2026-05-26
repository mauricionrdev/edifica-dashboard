import {
  BuildingIcon,
  ChecklistIcon,
  HomeIcon,
  MailIcon,
  SettingsIcon,
  SparklesIcon,
} from '../../components/ui/Icons.jsx';

export const WORKSPACE_AREAS = [
  {
    id: 'home',
    label: 'Início',
    shortLabel: 'Início',
    description: 'Visão operacional do dia, prioridades e itens recentes.',
    icon: HomeIcon,
  },
  {
    id: 'inbox',
    label: 'Caixa de entrada',
    shortLabel: 'Entrada',
    description: 'Itens que precisam de triagem antes de virar execução.',
    icon: MailIcon,
  },
  {
    id: 'tasks',
    label: 'Tarefas',
    shortLabel: 'Tarefas',
    description: 'Execução pessoal real com prazos, prioridade e contexto.',
    icon: ChecklistIcon,
  },
  {
    id: 'documents',
    label: 'Documentos',
    shortLabel: 'Docs',
    description: 'Páginas persistentes para registros internos.',
    icon: SparklesIcon,
  },
  {
    id: 'sheets',
    label: 'Planilhas',
    shortLabel: 'Planilhas',
    description: 'Grade operacional persistente inspirada em Google Planilhas.',
    icon: BuildingIcon,
  },
  {
    id: 'settings',
    label: 'Configurações',
    shortLabel: 'Config.',
    description: 'Preferências reais do workspace.',
    icon: SettingsIcon,
  },
];

export const WORKSPACE_AREA_IDS = WORKSPACE_AREAS.map((area) => area.id);
