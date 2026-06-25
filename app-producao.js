import { db } from "./firebase-config.js";
import { collection, getDocs, getDoc, updateDoc, doc, onSnapshot, addDoc, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const selectCorretor = document.getElementById('select-corretor');
const tabelaRanking = document.getElementById('tabela-ranking');
const form = document.getElementById('form-producao');

// Inicialização de Data
const inputMes = document.getElementById('mes-referencia');
if(inputMes) {
    const hoje = new Date();
    inputMes.value = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`; 
}

const selectHistorico = document.getElementById('select-historico');
const tabelaHistorico = document.getElementById('tabela-historico');

// ==========================================
// FUNÇÕES DE APOIO
// ==========================================
window.mostrarAlerta = (titulo, mensagem) => {
    document.getElementById('modal-alerta-titulo').innerText = titulo;
    document.getElementById('modal-alerta-mensagem').innerHTML = mensagem;
    new bootstrap.Modal(document.getElementById('modal-alerta')).show();
};

window.mostrarConfirmacao = (titulo, mensagem, callbackSim, corBtn = 'btn-success', textoBtn = 'Confirmar') => {
    document.getElementById('modal-confirmacao-titulo').innerText = titulo;
    document.getElementById('modal-confirmacao-mensagem').innerHTML = mensagem;
    const btn = document.getElementById('btn-confirmar-acao');
    btn.className = `btn fw-bold px-4 shadow-sm ${corBtn}`;
    btn.innerText = textoBtn;
    const novoBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(novoBtn, btn);
    const modalConfirm = new bootstrap.Modal(document.getElementById('modal-confirmacao'));
    novoBtn.onclick = () => { modalConfirm.hide(); callbackSim(); };
    modalConfirm.show();
};

// ==========================================
// INICIALIZAÇÃO DA TABELA (COM FILTRO DE ATIVOS)
// ==========================================
onSnapshot(collection(db, "corretores"), (snapshot) => {
    let corretores = [];
    snapshot.forEach(d => {
        let dados = d.data();
        // APENAS ATIVOS APARECEM NA PRODUÇÃO
        if (dados.ativo !== false) {
            corretores.push({ id: d.id, ...dados });
        }
    });

    corretores.sort((a, b) => a.nome.localeCompare(b.nome));
    
    if(selectCorretor) {
        let htmlOptions = '<option value="">Selecione...</option>';
        corretores.forEach(c => { htmlOptions += `<option value="${c.id}">${c.nome}</option>`; });
        selectCorretor.innerHTML = htmlOptions;
    }

    renderizarRanking(corretores, tabelaRanking, false);
});

// ==========================================
// RENDERIZAÇÃO DO RANKING
// ==========================================
function renderizarRanking(lista, elementoTabela, ehHistorico = false) {
    if(!elementoTabela) return;

    lista.forEach(c => {
        c.v_pme = parseFloat(c.producao_pme) || 0;
        c.v_pf = parseFloat(c.producao_pf) || 0;
        c.totalMoney = c.v_pme + c.v_pf;
        c.pontos = (c.v_pme * 2) + c.v_pf;
        c.isParticipante = c.participa_plantao !== false; 

        c.leadsPmeCalculados = (c.isParticipante && c.totalMoney >= 3000) ? 1 + Math.floor(c.v_pme / 2000) : 0;
    });

    lista.sort((a, b) => b.pontos - a.pontos);

    let html = '';
    const fmtMoney = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    lista.forEach((c, index) => {
        let medalha = index < 3 && c.pontos > 0 ? ["🥇", "🥈", "🥉"][index] : "";
        let recPme = parseInt(c.leads_recebidos_pme) || 0;
        let recPf = parseInt(c.leads_recebidos_pf) || 0;

        html += `
            <tr class="${!c.isParticipante ? 'bg-light text-muted' : ''}">
                <td class="text-start ps-4 fw-bold text-uppercase">${medalha} ${c.nome}</td>
                <td class="text-warning fw-bold">${fmtMoney(c.v_pme)}</td>
                <td class="text-info fw-bold">${fmtMoney(c.v_pf)}</td>
                <td class="fw-bold text-secondary">${fmtMoney(c.totalMoney)}</td>
                <td><span class="badge bg-dark shadow-sm">${Math.floor(c.pontos)} pts</span></td>
                ${ehHistorico ? '' : `
                    <td class="bg-warning fw-bold fs-5">${c.leadsPmeCalculados}</td>
                    <td class="bg-info text-white fw-bold fs-5">${recPme}</td>
                    <td class="bg-primary text-white fw-bold fs-5">${recPf}</td>
                    <td>
                        <div class="d-flex justify-content-center">
                            <button onclick="togglePlantaoStatus('${c.id}', '${c.nome}', ${c.isParticipante})" class="btn btn-sm btn-outline-${c.isParticipante ? 'success' : 'danger'} p-1 px-2 shadow-sm" title="Status Plantão">${c.isParticipante ? '🟢' : '🔴'}</button>
                            <button onclick="abrirModalEditarProducao('${c.id}', '${c.nome}', ${c.v_pme}, ${c.v_pf}, '${c.mes_competencia || ''}', ${recPme}, ${recPf})" class="btn btn-sm btn-outline-warning p-1 px-2 shadow-sm ms-1">✏️</button>
                        </div>
                    </td>
                `}
            </tr>
        `;
    });
    elementoTabela.innerHTML = html || '<tr><td colspan="10" class="text-center py-4 text-muted">Nenhum dado encontrado.</td></tr>';
}

// ==========================================
// AÇÕES DE STATUS (SINCRONIZADAS)
// ==========================================
window.togglePlantaoStatus = async (id, nome, participaAtual) => {
    window.mostrarConfirmacao("Status Plantão", `Deseja ${participaAtual ? 'SUSPENDER' : 'PERMITIR'} o corretor <b>${nome}</b> no plantão?`, async () => {
        await updateDoc(doc(db, "corretores", id), { participa_plantao: !participaAtual });
    }, participaAtual ? 'btn-danger' : 'btn-success', participaAtual ? '🔴 Suspender' : '🟢 Permitir');
};

// ... (Mantenha aqui as funções de salvarEdicaoProducao, zerarProducao e iniciarNovoCiclo originais) ...
