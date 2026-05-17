// Dados extraídos do relatório PDF fornecido: relatorio_uso_api_keys.pdf
export const OPENAI_USAGE_REPORT = {
  title: 'Relatório de Uso por API Key',
  organization: 'Edifica',
  period: 'Maio de 2026',
  source: 'OpenAI — exportação de projetos',
  totalSpend: 197.52,
  activeClientSpend: 63.88,
  activeProjects: 35,
  activeClientsWithSpend: 26,
  zeroSpendProjects: ["Tomás Enrique", "Alice Machado", "Marcos Fernandes", "Pedro Nunes", "Mendes e Guerra", "Laércio Gallassi", "Geller Advocacia", "Keila Zibordi", "Juliane Mondadori"],
  legacyProject: {
    name: 'Default project',
    spend: 133.64,
    percentOfTotal: 67.7,
    note: 'Chaves antigas desativadas, substituídas pelos projetos atuais',
  },
  rows: [
    {
        "client": "Dutra Dacroce",
        "spend": 7.88,
        "shareOfActive": 12.3
    },
    {
        "client": "Bernardes França",
        "spend": 7.51,
        "shareOfActive": 11.8
    },
    {
        "client": "Caroline Braga",
        "spend": 7.17,
        "shareOfActive": 11.2
    },
    {
        "client": "Prev GS",
        "spend": 6.12,
        "shareOfActive": 9.6
    },
    {
        "client": "Edy Advocacia",
        "spend": 3.64,
        "shareOfActive": 5.7
    },
    {
        "client": "Gonçalves & Barbosa",
        "spend": 3.62,
        "shareOfActive": 5.7
    },
    {
        "client": "Sousa e Lapa",
        "spend": 3.23,
        "shareOfActive": 5.1
    },
    {
        "client": "Kálita Camargo",
        "spend": 2.93,
        "shareOfActive": 4.6
    },
    {
        "client": "Reche e Sá",
        "spend": 2.51,
        "shareOfActive": 3.9
    },
    {
        "client": "CMP Advogados",
        "spend": 2.42,
        "shareOfActive": 3.8
    },
    {
        "client": "Genilson Ramos",
        "spend": 2.33,
        "shareOfActive": 3.6
    },
    {
        "client": "Steves Barbosa",
        "spend": 2.0,
        "shareOfActive": 3.1
    },
    {
        "client": "Gabriel Moldenhauer",
        "spend": 1.97,
        "shareOfActive": 3.1
    },
    {
        "client": "HD Advogados",
        "spend": 1.6,
        "shareOfActive": 2.5
    },
    {
        "client": "Santos e Morais",
        "spend": 1.46,
        "shareOfActive": 2.3
    },
    {
        "client": "Renata Cabral",
        "spend": 1.25,
        "shareOfActive": 2.0
    },
    {
        "client": "Carmen Cristina Braga",
        "spend": 1.2,
        "shareOfActive": 1.9
    },
    {
        "client": "LRD Advocacia",
        "spend": 0.97,
        "shareOfActive": 1.5
    },
    {
        "client": "Silva & Schmitz",
        "spend": 0.89,
        "shareOfActive": 1.4
    },
    {
        "client": "Flaudir Lima",
        "spend": 0.81,
        "shareOfActive": 1.3
    },
    {
        "client": "Oliveira e Damasceno",
        "spend": 0.8,
        "shareOfActive": 1.3
    },
    {
        "client": "Ribeiro Advogados Associados",
        "spend": 0.68,
        "shareOfActive": 1.1
    },
    {
        "client": "Valderes Baratieri",
        "spend": 0.5,
        "shareOfActive": 0.8
    },
    {
        "client": "Fábio Elias Amarilla Costa",
        "spend": 0.27,
        "shareOfActive": 0.4
    },
    {
        "client": "Lívia Monteiro",
        "spend": 0.1,
        "shareOfActive": 0.2
    },
    {
        "client": "Fog Advocacia",
        "spend": 0.02,
        "shareOfActive": 0.0
    }
],
};

export function currencyUsd(value = 0) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

export function percent(value = 0) {
  return `${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
