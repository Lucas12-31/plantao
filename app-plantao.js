import { db } from "./firebase-config.js";
import { collection, getDocs, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
        if (dados.saldo_pme > 0 || dados.saldo_pf > 0) {
            estado.corretores.push({ id: d.id, ...dados });
        }
    });

    // Escuta Leads
    onSnapshot(collection(db, "leads"), (snap) => {
        estado.leads = [];
        snap.forEach(d => estado.leads.push(d.data()));
        atualizarVisualizacao();
    });
};

// 2. RENDERIZAÇÃO (DIAS x 3 VAGAS)
function atualizarVisualizacao() {
    loading.classList.add('d-none');
    
    // Configura dias
    const [ano, mes] = filtroMes.value.split('-');
    estado.diasDoMes = getDiasUteisMes(parseInt(ano), parseInt(mes) - 1);
    estado.semanas = agruparSemanas(estado.diasDoMes);

    // Garante escala
    if (!estado.escalaFixa[filtroMes.value]) {
        estado.escalaFixa[filtroMes.value] = gerarLogicaRodizio(estado.diasDoMes, estado.corretores);
    }
    const escalaAtual = estado.escalaFixa[filtroMes.value];

    // Pega a semana
    const indiceSemana = parseInt(filtroSemana.value);
    const diasDaSemana = estado.semanas[indiceSemana] || [];

    if (diasDaSemana.length === 0) {
        tabelaBody.innerHTML = '<tr><td colspan="4" class="text-center py-4">Sem dias úteis nesta semana/mês.</td></tr>';
        return;
    }

    // --- DESENHAR LINHAS (DIAS) ---
    let htmlBody = '';
    
    diasDaSemana.forEach(dia => {
        // dia = { iso: "2026-02-09", fmt: "09/02", diaSemana: "Segunda" }
        
        let hojeISO = new Date().toISOString().split('T')[0];
        let classHoje = (dia.iso === hojeISO) ? "bg-warning" : "bg-white";
        let textoHoje = (dia.iso === hojeISO) ? '<br><span class="badge bg-danger mt-1">HOJE</span>' : '';

        htmlBody += `<tr>`;
        
        // COLUNA 1: DATA
        htmlBody += `
            <td class="${classHoje} border-end border-3 border-dark fw-bold" style="min-width: 140px;">
                <div class="fs-4">${dia.diaSemana}</div>
                <div class="text-muted">${dia.fmt}</div>
                ${textoHoje}
            </td>
        `;

        // COLUNAS 2, 3, 4: OS 3 CORRETORES ESCALADOS
        const escalados = escalaAtual[dia.iso] || [];

        // Loop fixo de 3 vezes (para as 3 vagas)
        for (let i = 0; i < 3; i++) {
            let corretor = escalados[i];

            if (corretor) {
                // Se tem corretor na vaga, calcula os leads DELE naquele dia
                const leadsPME = estado.leads.filter(l => l.corretor_id === corretor.id && l.data_entrega === dia.iso && l.tipo === 'pme').length;
                const leadsPF = estado.leads.filter(l => l.corretor_id === corretor.id && l.data_entrega === dia.iso && l.tipo === 'pf').length;

                htmlBody += `
                    <td>
                        <div class="card-vaga">
                            <div class="nome-corretor">${corretor.nome.split(' ')[0]}</div>
                            <div class="d-flex gap-2">
                                <span class="badge bg-warning text-dark border border-dark p-2" style="min-width: 60px;">
                                    PME: ${leadsPME}
                                </span>
                                <span class="badge bg-info text-white border border-dark p-2" style="min-width: 60px;">
                                    PF: ${leadsPF}
                                </span>
                            </div>
                        </div>
                    </td>
                `;
            } else {
                // Vaga vazia (caso tenha menos de 3 corretores no total)
                htmlBody += `<td class="bg-light text-muted fst-italic"><small>Vaga Livre</small></td>`;
            }
        }

        htmlBody += `</tr>`;
    });
    tabelaBody.innerHTML = htmlBody;
}

// LISTENERS
filtroMes.addEventListener('change', atualizarVisualizacao);
filtroSemana.addEventListener('change', atualizarVisualizacao);

window.refazerSorteio = () => {
    if(confirm("Refazer o sorteio apagará a escala atual deste mês. Continuar?")) {
        estado.escalaFixa[filtroMes.value] = null;
        atualizarVisualizacao();
    }
};

// HELPERS
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
        // Tenta achar 3 pessoas diferentes
        while (escalados.length < 3 && tentativas < 100) {
            let cand = corretores[Math.floor(Math.random() * corretores.length)];
            let jaEsta = escalados.some(c => c.id === cand.id);
            let trabalhouOntem = ultimoPlantao.some(c => c.id === cand.id);
            
            // Se tiver menos de 6 pessoas na equipe, permite trabalhar dias seguidos
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
