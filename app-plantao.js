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
    escalaFixa: {}, 
    diasDoMes: [],
    semanas: []
};

// 1. INICIALIZAÇÃO
window.iniciarPlantao = async () => {
    if (!filtroMes.value) {
        const hoje = new Date();
        const yyyy = hoje.getFullYear();
        const mm = String(hoje.getMonth() + 1).padStart(2, '0');
        filtroMes.value = `${yyyy}-${mm}`;
    }

    tabelaBody.innerHTML = '';
    loading.classList.remove('d-none');

    // Busca Corretores
    const snapCorretores = await getDocs(collection(db, "corretores"));
    estado.corretores = [];
    snapCorretores.forEach(d => {
        let dados = d.data();
        // Só entra na escala quem tem meta
        if (dados.saldo_pme > 0 || dados.saldo_pf > 0) {
            estado.corretores.push({ id: d.id, ...dados });
        }
    });

    // Ordena corretores por nome
    estado.corretores.sort((a, b) => a.nome.localeCompare(b.nome));

    // Escuta Leads
    onSnapshot(collection(db, "leads"), (snap) => {
        estado.leads = [];
        snap.forEach(d => estado.leads.push(d.data()));
        atualizarVisualizacao();
    });
};

// 2. RENDERIZAÇÃO INVERTIDA (Dias nas Linhas, Corretores nas Colunas)
function atualizarVisualizacao() {
    loading.classList.add('d-none');
    
    // Recalcula dias baseados no Mês Selecionado
    const [ano, mes] = filtroMes.value.split('-');
    estado.diasDoMes = getDiasUteisMes(parseInt(ano), parseInt(mes) - 1);
    estado.semanas = agruparSemanas(estado.diasDoMes);

    // Garante escala
    if (!estado.escalaFixa[filtroMes.value]) {
        estado.escalaFixa[filtroMes.value] = gerarLogicaRodizio(estado.diasDoMes, estado.corretores);
    }
    const escalaAtual = estado.escalaFixa[filtroMes.value];

    // Pega a semana selecionada
    const indiceSemana = parseInt(filtroSemana.value);
    const diasDaSemana = estado.semanas[indiceSemana] || [];

    if (diasDaSemana.length === 0) {
        tabelaHead.innerHTML = '';
        tabelaBody.innerHTML = '<tr><td colspan="10" class="text-center py-4">Sem dias úteis nesta semana/mês.</td></tr>';
        return;
    }

    // --- CABEÇALHO: NOMES DOS CORRETORES ---
    let htmlHead = `<tr><th style="width: 150px; background-color: #212529; color: white;">DATA / DIA</th>`;
    estado.corretores.forEach(c => {
        htmlHead += `
            <th style="min-width: 180px;">
                ${c.nome.split(' ')[0]}
                <div style="font-size: 0.65em; font-weight: normal; opacity: 0.8;">
                    META: PME ${c.saldo_pme} | PF ${c.saldo_pf}
                </div>
            </th>
        `;
    });
    htmlHead += `</tr>`;
    tabelaHead.innerHTML = htmlHead;

    // --- CORPO: DIAS DA SEMANA (LINHAS) ---
    let htmlBody = '';
    
    diasDaSemana.forEach(dia => {
        // dia = { iso: "2026-02-02", fmt: "02/02", diaSemana: "Segunda" }
        
        // Destaca se for HOJE
        let hojeISO = new Date().toISOString().split('T')[0];
        let classHoje = (dia.iso === hojeISO) ? "bg-warning border-warning" : "bg-light";
        let textoHoje = (dia.iso === hojeISO) ? '<br><span class="badge bg-danger">HOJE</span>' : '';

        htmlBody += `<tr>`;
        
        // Coluna 1: Data (Na lateral esquerda)
        htmlBody += `
            <td class="${classHoje} fw-bold text-center border-end border-3 border-dark" style="vertical-align: middle;">
                <div class="fs-5">${dia.diaSemana}</div>
                <div class="text-muted">${dia.fmt}</div>
                ${textoHoje}
            </td>
        `;

        // Colunas Seguintes: Cada Corretor
        estado.corretores.forEach(corretor => {
            // Verifica se o corretor está escalado neste dia
            const escaladosNoDia = escalaAtual[dia.iso] || [];
            const estaEscalado = escaladosNoDia.some(c => c.id === corretor.id);

            if (!estaEscalado) {
                // Folga (Célula vazia/cinza)
                htmlBody += `<td class="cell-folga bg-light text-muted" style="vertical-align: middle;"><small>-</small></td>`;
            } else {
                // Plantão (Célula Branca)
                // Calcular leads deste dia específico
                const leadsPME = estado.leads.filter(l => l.corretor_id === corretor.id && l.data_entrega === dia.iso && l.tipo === 'pme').length;
                const leadsPF = estado.leads.filter(l => l.corretor_id === corretor.id && l.data_entrega === dia.iso && l.tipo === 'pf').length;
                
                // Cálculo de Saldo Restante (Meta Mensal - Entregues Hoje) ??? 
                // Obs: Se quiser mostrar o acumulado, a lógica muda. 
                // Aqui estou mostrando: O que ele recebeu NESTE DIA.
                
                htmlBody += `
                    <td class="cell-plantao bg-white border border-secondary" style="vertical-align: middle;">
                        <div class="d-flex justify-content-center gap-2">
                            <span class="badge bg-warning text-dark border border-dark p-2" title="PME Entregues Hoje">
                                PME: ${leadsPME}
                            </span>
                            <span class="badge bg-info text-white border border-dark p-2" title="PF Entregues Hoje">
                                PF: ${leadsPF}
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

// LISTENERS
filtroMes.addEventListener('change', atualizarVisualizacao);
filtroSemana.addEventListener('change', atualizarVisualizacao);

window.refazerSorteio = () => {
    if(confirm("Isso vai apagar a escala deste mês e gerar uma nova aleatória. Continuar?")) {
        estado.escalaFixa[filtroMes.value] = null;
        atualizarVisualizacao();
    }
};

// HELPERS (Iguais ao anterior)
function getDiasUteisMes(ano, mesIndex) {
    let date = new Date(ano, mesIndex, 1);
    let days = [];
    const nomesDias = ['Dom', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sáb'];

    while (date.getMonth() === mesIndex) {
        let diaSemana = date.getDay();
        if (diaSemana !== 0 && diaSemana !== 6) { 
            let iso = date.toISOString().split('T')[0]; 
            let fmt = date.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'});
            days.push({ iso, fmt, diaSemana: nomesDias[diaSemana] });
        }
        date.setDate(date.getDate() + 1);
    }
    return days;
}

function agruparSemanas(diasUteis) {
    let semanas = [];
    let semanaAtual = [];
    diasUteis.forEach(dia => {
        semanaAtual.push(dia);
        if (dia.diaSemana === 'Sexta' || semanaAtual.length === 5) {
            semanas.push(semanaAtual);
            semanaAtual = [];
        }
    });
    if (semanaAtual.length > 0) semanas.push(semanaAtual);
    return semanas;
}

function gerarLogicaRodizio(dias, corretores) {
    if (corretores.length === 0) return {};
    let escala = {};
    let ultimoPlantao = [];

    dias.forEach(objDia => { 
        let escalados = [];
        let tentativas = 0;
        while (escalados.length < 3 && tentativas < 100) {
            let cand = corretores[Math.floor(Math.random() * corretores.length)];
            let jaEsta = escalados.some(c => c.id === cand.id);
            let trabalhouOntem = ultimoPlantao.some(c => c.id === cand.id);
            if (corretores.length < 6) trabalhouOntem = false;
            if (!jaEsta && !trabalhouOntem) escalados.push(cand);
            tentativas++;
        }
        escala[objDia.iso] = escalados;
        ultimoPlantao = escalados;
    });
    return escala;
}

window.iniciarPlantao();
