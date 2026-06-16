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
    icon: HomeIcon,
  },
  {
    id: 'inbox',
    label: 'Caixa de entrada',
    shortLabel: 'Entrada',
    icon: MailIcon,
  },
  {
    id: 'tasks',
    label: 'Tarefas',
    shortLabel: 'Tarefas',
    icon: ChecklistIcon,
  },
  {
    id: 'documents',
    label: 'Documentos',
    shortLabel: 'Docs',
    icon: SparklesIcon,
  },
  {
    id: 'sheets',
    label: 'Planilhas',
    shortLabel: 'Planilhas',
    icon: BuildingIcon,
  },
  {
    id: 'settings',
    label: 'Configurações',
    shortLabel: 'Config.',
    icon: SettingsIcon,
  },
];

export const WORKSPACE_AREA_IDS = WORKSPACE_AREAS.map((area) => area.id);
