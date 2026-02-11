import { db } from "./firebase-config.js";
import { collection, getDocs, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const tabelaHead = document.getElementById('tabela-header');
const tabelaBody = document.getElementById('tabela-body');
const filtroMes = document.getElementById('filtro-mes');
const filtroSemana = document.getElementById('filtro-semana');
const loading = document.getElementById('loading');

// ESTADO GLOBAL
let estado = {
    corretores: [],
    leads: [],
    escalaFixa: {}, // { "2026-02-10": [id1, id2, id3] }
    diasDoMes: [],  // Todos os dias úteis do mês selecionado
    semanas: []     // Dias agrupados em arrays de 5
};

// 1. INICIALIZAÇÃO
window.iniciarPlantao = async () => {
    // Define mês atual no input se estiver vazio
    if (!filtroMes.value) {
        const hoje = new Date();
        const yyyy = hoje.getFullYear();
        const mm = String(hoje.getMonth() + 1).padStart(2, '0');
        filtroMes.value = `${yyyy}-${mm}`;
    }

    tabelaBody.innerHTML = '';
    loading.classList.remove('d-none');

    // Busca Corretores (Uma vez)
    const snapCorretores = await getDocs(collection(db, "corretores"));
    estado.corretores = [];
    snapCorretores.forEach(d => {
        let dados = d.data();
        // Só entra na planilha quem tem meta definida (Saldo > 0)
        if (dados.saldo_pme > 0 || dados.saldo_pf > 0) {
            estado.corretores.push({ id: d.id, ...dados });
        }
    });

    // Ordena corretores por nome
    estado.corretores.sort((a, b) => a.nome.localeCompare(b.nome));

    // Escuta Leads em Tempo Real
    onSnapshot(collection(db, "leads"), (snap) => {
        estado.leads = [];
        snap.forEach(d => estado.leads.push(d.data()));
        atualizarVisualizacao(); // Redesenha se entrar lead novo
    });
};

// 2. FUNÇÃO PRINCIPAL DE RENDERIZAÇÃO
function atualizarVisualizacao() {
    loading.classList.add('d-none');
    
    // Recalcula dias baseados no Mês Selecionado
    const [ano, mes] = filtroMes.value.split('-');
    estado.diasDoMes = getDiasUteisMes(parseInt(ano), parseInt(mes) - 1);
    
    // Agrupa em semanas (chunks de 5 dias ou quebras de sexta-feira)
    estado.semanas = agruparSemanas(estado.diasDoMes);

    // Garante que temos uma escala para esses dias
    if (!estado.escalaFixa[filtroMes.value]) {
        estado.escalaFixa[filtroMes.value] = gerarLogicaRodizio(estado.diasDoMes, estado.corretores);
    }
    const escalaAtual = estado.escalaFixa[filtroMes.value];

    // Pega a semana selecionada no filtro
    const indiceSemana = parseInt(filtroSemana.value);
    const diasDaSemana = estado.semanas[indiceSemana] || [];

    if (diasDaSemana.length === 0) {
        tabelaHead.innerHTML = '';
        tabelaBody.innerHTML = '<tr><td colspan="10" class="text-center py-4">Esta semana não possui dias úteis neste mês.</td></tr>';
        return;
    }

    // --- DESENHAR CABEÇALHO (DIAS) ---
    let htmlHead = `<tr><th style="width: 200px;">CORRETOR</th>`;
    diasDaSemana.forEach(dia => {
        // dia = { iso: "2026-02-10", fmt: "10/02", diaSemana: "Terça" }
        htmlHead += `<th>${dia.diaSemana}<br><small class="text-muted fw-normal">${dia.fmt}</small></th>`;
    });
    htmlHead += `</tr>`;
    tabelaHead.innerHTML = htmlHead;

    // --- DESENHAR LINHAS (CORRETORES) ---
    let htmlBody = '';
    
    estado.corretores.forEach(corretor => {
        htmlBody += `<tr>`;
        
        // Coluna 1: Nome e Metas Totais
        htmlBody += `
            <td class="text-start bg-light fw-bold px-3">
                ${corretor.nome}
                <div class="mt-2 small text-secondary fw-normal">
                    Meta PME: ${corretor.saldo_pme}<br>
                    Meta PF: ${corretor.saldo_pf}
                </div>
            </td>
        `;

        // Colunas: Dias da Semana
        diasDaSemana.forEach(dia => {
            // Verifica se o corretor está na escala deste dia
            const escaladosHoje = escalaAtual[dia.iso] || [];
            const estaEscalado = escaladosHoje.some(c => c.id === corretor.id);

            if (!estaEscalado) {
                htmlBody += `<td class="cell-folga"><small>-</small></td>`;
            } else {
                // Está trabalhando! Calcular Leads
                const leadsPME = estado.leads.filter(l => l.corretor_id === corretor.id && l.data_entrega === dia.iso && l.tipo === 'pme').length;
                const leadsPF = estado.leads.filter(l => l.corretor_id === corretor.id && l.data_entrega === dia.iso && l.tipo === 'pf').length;

                // Faltam
                const faltamPME = (corretor.saldo_pme || 0) - leadsPME; // Isso é saldo global, mas aqui mostramos o do dia?
                // O cálculo "Faltam" deve ser Global ou Diário?
                // No código anterior, comparávamos Meta Mensal - Entregues Hoje. Isso ficava confuso.
                // Vou mostrar: Entregues Hoje / Meta Mensal
                
                htmlBody += `
                    <td class="cell-plantao">
                        <div class="d-flex flex-column gap-1">
                            <span class="badge bg-warning text-dark text-start">
                                PME: ${leadsPME} <span style="opacity:0.5">/ ${corretor.saldo_pme}</span>
                            </span>
                            <span class="badge bg-info text-white text-start">
                                PF: ${leadsPF} <span style="opacity:0.5">/ ${corretor.saldo_pf}</span>
                            </span>
                        </div>
                    </td>
                `;
            }
        });

        htmlBody += `</tr>`;
    });
    tabelaBody.innerHTML = htmlBody;
}

// 3. LISTENERS DOS FILTROS
filtroMes.addEventListener('change', atualizarVisualizacao);
filtroSemana.addEventListener('change', atualizarVisualizacao);

window.refazerSorteio = () => {
    if(confirm("Isso vai apagar a escala deste mês e gerar uma nova aleatória. Continuar?")) {
        estado.escalaFixa[filtroMes.value] = null; // Zera memória deste mês
        atualizarVisualizacao();
    }
};

// --- HELPER: LOGICA DE DIAS E SEMANAS ---

function getDiasUteisMes(ano, mesIndex) {
    let date = new Date(ano, mesIndex, 1);
    let days = [];
    
    // Nomes dos dias para o cabeçalho
    const nomesDias = ['Dom', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sáb'];

    while (date.getMonth() === mesIndex) {
        let diaSemana = date.getDay();
        if (diaSemana !== 0 && diaSemana !== 6) { // 0=Dom, 6=Sab
            let iso = date.toISOString().split('T')[0]; 
            let fmt = date.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'});
            days.push({ 
                iso: iso, 
                fmt: fmt, 
                diaSemana: nomesDias[diaSemana] 
            });
        }
        date.setDate(date.getDate() + 1);
    }
    return days;
}

function agruparSemanas(diasUteis) {
    // Agrupa os dias em blocos de 5 (Seg-Sex) ou conforme a semana real do ano
    // Para simplificar a visualização "Planilha", vamos quebrar sempre que mudar de Sexta para Segunda
    // OU simplesmente fatiar em grupos de 5 dias úteis, já que ignoramos fds.
    
    let semanas = [];
    let semanaAtual = [];

    diasUteis.forEach(dia => {
        semanaAtual.push(dia);
        // Se for sexta-feira ou se completou 5 dias no bloco
        if (dia.diaSemana === 'Sexta' || semanaAtual.length === 5) {
            semanas.push(semanaAtual);
            semanaAtual = [];
        }
    });
    
    // Adiciona a sobra (se o mês acabar numa quarta feira, por exemplo)
    if (semanaAtual.length > 0) semanas.push(semanaAtual);

    return semanas;
}

// --- HELPER: SORTEIO DO RODÍZIO ---
function gerarLogicaRodizio(dias, corretores) {
    if (corretores.length === 0) return {};
    let escala = {};
    let ultimoPlantao = [];

    dias.forEach(objDia => { 
        let escalados = [];
        let tentativas = 0;
        
        // Tenta escalar 3 pessoas
        while (escalados.length < 3 && tentativas < 100) {
            let cand = corretores[Math.floor(Math.random() * corretores.length)];
            
            let jaEsta = escalados.some(c => c.id === cand.id);
            let trabalhouOntem = ultimoPlantao.some(c => c.id === cand.id);
            if (corretores.length < 6) trabalhouOntem = false;

            if (!jaEsta && !trabalhouOntem) {
                escalados.push(cand);
            }
            tentativas++;
        }
        escala[objDia.iso] = escalados;
        ultimoPlantao = escalados;
    });
    return escala;
}

// Start
window.iniciarPlantao();
