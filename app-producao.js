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

// ==========================================
// LANÇAMENTO DE PRODUÇÃO
// ==========================================
if(form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id = selectCorretor.value;
        const nomeCorretor = selectCorretor.options[selectCorretor.selectedIndex].text;
        const mesRef = document.getElementById('mes-referencia').value;
        const valorPme = parseFloat(document.getElementById('valor-pme').value) || 0;
        const valorPf = parseFloat(document.getElementById('valor-pf').value) || 0;

        if (!id || !mesRef) return window.mostrarAlerta("Atenção", "Preencha o corretor e o mês da produção!");
        if (valorPme <= 0 && valorPf <= 0) return window.mostrarAlerta("Atenção", "Preencha um valor válido para PME ou PF!");

        try {
            const corretorRef = doc(db, "corretores", id);
            const docSnap = await getDoc(corretorRef);
            const dadosAtuais = docSnap.data();

            let novoPme = (parseFloat(dadosAtuais.producao_pme) || 0) + valorPme;
            let novoPf = (parseFloat(dadosAtuais.producao_pf) || 0) + valorPf;
            let total = novoPme + novoPf;
            
            let isAtivo = dadosAtuais.elegivel !== false;
            let leadsGanhos = 0;
            if (isAtivo && total >= 3000) {
                leadsGanhos = 1 + Math.floor(novoPme / 2000);
            }

            if (valorPme > 0) {
                await addDoc(collection(db, "lancamentos_producao"), {
                    corretor_id: id, corretor_nome: nomeCorretor, tipo_produto: 'pme', valor_lancado: valorPme, mes_competencia: mesRef, data_lancamento: new Date().toISOString()
                });
            }
            if (valorPf > 0) {
                await addDoc(collection(db, "lancamentos_producao"), {
                    corretor_id: id, corretor_nome: nomeCorretor, tipo_produto: 'pf', valor_lancado: valorPf, mes_competencia: mesRef, data_lancamento: new Date().toISOString()
                });
            }

            await updateDoc(corretorRef, {
                producao_pme: novoPme,
                producao_pf: novoPf,
                leads_ganhos_pme: leadsGanhos,
                mes_competencia: mesRef
            });
            
            window.mostrarAlerta("Sucesso ✅", "Produção salva! A meta de leads do corretor foi recalculada.");
            
            document.getElementById('valor-pme').value = ''; 
            document.getElementById('valor-pf').value = ''; 
            
            const modalEl = document.getElementById('modal-lancar-producao');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if(modal) modal.hide();
        } catch (error) { 
            console.error(error); 
            window.mostrarAlerta("Erro", "Ocorreu um erro ao lançar a produção."); 
        }
    });
}

// ==========================================
// EDIÇÃO E ZERAR PRODUÇÃO (LÁPIS E LIXEIRA)
// ==========================================
window.abrirModalEditarProducao = (id, nome, pmeAtual, pfAtual, mesAtual, recPme, recPf) => {
    document.getElementById('edit-prod-id').value = id;
    document.getElementById('edit-prod-nome').innerText = nome;
    document.getElementById('edit-prod-pme').value = pmeAtual;
    document.getElementById('edit-prod-pf').value = pfAtual;
    document.getElementById('edit-prod-mes').value = mesAtual;
    document.getElementById('edit-rec-pme').value = recPme;
    document.getElementById('edit-rec-pf').value = recPf;
    new bootstrap.Modal(document.getElementById('modal-editar-producao')).show();
};

window.salvarEdicaoProducao = async () => {
    const id = document.getElementById('edit-prod-id').value;
    const novoPme = parseFloat(document.getElementById('edit-prod-pme').value) || 0;
    const novoPf = parseFloat(document.getElementById('edit-prod-pf').value) || 0;
    const novoMes = document.getElementById('edit-prod-mes').value;
    const novoRecPme = parseInt(document.getElementById('edit-rec-pme').value) || 0;
    const novoRecPf = parseInt(document.getElementById('edit-rec-pf').value) || 0;

    try {
        const docSnap = await getDoc(doc(db, "corretores", id));
        let isAtivo = docSnap.data().elegivel !== false;
        let total = novoPme + novoPf;
        
        let leadsGanhos = 0;
        if (isAtivo && total >= 3000) {
            leadsGanhos = 1 + Math.floor(novoPme / 2000);
        }

        await updateDoc(doc(db, "corretores", id), {
            producao_pme: novoPme, 
            producao_pf: novoPf, 
            mes_competencia: novoMes, 
            leads_ganhos_pme: leadsGanhos,
            leads_recebidos_pme: novoRecPme,
            leads_recebidos_pf: novoRecPf
        });
        bootstrap.Modal.getInstance(document.getElementById('modal-editar-producao')).hide();
        window.mostrarAlerta("Atualizado", "A ficha do corretor foi ajustada com sucesso.");
    } catch (error) { 
        console.error(error); 
        window.mostrarAlerta("Erro", "Erro ao atualizar a produção manual."); 
    }
};

window.zerarProducaoCorretor = async (id, nome) => {
    window.mostrarConfirmacao("Zerar Corretor", `⚠️ Tem certeza que deseja <b>ZERAR</b> toda a produção e leads recebidos de <b>${nome}</b> neste mês?`, async () => {
        try {
            await updateDoc(doc(db, "corretores", id), {
                producao_pme: 0, producao_pf: 0, leads_ganhos_pme: 0, leads_recebidos_pme: 0, leads_recebidos_pf: 0, mes_competencia: "" 
            });
            window.mostrarAlerta("Zerado", `A produção de ${nome} foi apagada.`);
        } catch (error) { 
            console.error(error); 
            window.mostrarAlerta("Erro", "Falha ao zerar corretor.");
        }
    }, 'btn-danger', '🗑️ Sim, Zerar');
};

window.toggleElegibilidade = async (id, nome, statusAtual, pme, pf) => {
    let novoStatus = !statusAtual;
    let acao = novoStatus ? "ATIVAR" : "SUSPENDER";
    let cor = novoStatus ? "btn-success" : "btn-danger";
    let icon = novoStatus ? "🟢" : "🔴";

    window.mostrarConfirmacao("Alterar Status", `Deseja <b>${acao}</b> o corretor ${nome} do recebimento de Leads e da Escala Presencial?`, async () => {
        try {
            let leadsGanhos = 0;
            let total = pme + pf;
            if (novoStatus && total >= 3000) { leadsGanhos = 1 + Math.floor(pme / 2000); }
            await updateDoc(doc(db, "corretores", id), { elegivel: novoStatus, leads_ganhos_pme: leadsGanhos });
        } catch(e) { 
            console.error(e); 
            window.mostrarAlerta("Erro", "Falha ao alterar o status do corretor.");
        }
    }, cor, `${icon} Sim, ${acao}`);
};

// ==========================================
// INICIAR NOVO CICLO (Com Campo de Senha)
// ==========================================
export async function iniciarNovoCiclo() {
    let msg = `1. Salva a Produção Atual no Histórico.<br>2. ZERA os Totais Financeiros E OS LEADS RECEBIDOS para o novo mês.<br><br><b>Digite a senha de administrador para continuar:</b><br><input type="password" id="input-senha-ciclo" class="form-control mt-3 text-center fw-bold" placeholder="******">`;

    window.mostrarConfirmacao("📅 INICIAR NOVO CICLO DE VENDAS", msg, async () => {
        const senha = document.getElementById('input-senha-ciclo').value;
        if (senha !== "limao123") return window.mostrarAlerta("Acesso Negado ⛔", "A senha digitada está incorreta.");

        try {
            const snapshot = await getDocs(collection(db, "corretores"));
            const dataHoje = new Date().toLocaleDateString('pt-BR');
            const referenciaCiclo = `Ciclo encerrado em ${dataHoje}`;

            for (const d of snapshot.docs) {
                const dados = d.data();
                if(dados.producao_pme > 0 || dados.producao_pf > 0) {
                    await addDoc(collection(db, "historico_fechamentos"), {
                        data_fechamento: new Date().toISOString(), referencia: referenciaCiclo,
                        corretor: dados.nome, producao_final_pme: dados.producao_pme, producao_final_pf: dados.producao_pf
                    });
                }
                await updateDoc(doc(db, "corretores", d.id), {
                    producao_pme: 0, producao_pf: 0, leads_ganhos_pme: 0, leads_recebidos_pme: 0, leads_recebidos_pf: 0, mes_competencia: "" 
                });
            }
            window.mostrarAlerta("Sucesso! ✅", "Novo ciclo iniciado! O histórico foi salvo e a roleta financeira foi zerada.");
            carregarOpcoesHistorico(); 
        } catch (error) { 
            console.error(error); 
            window.mostrarAlerta("Erro Crítico", "Falha de conexão ao tentar processar o novo ciclo."); 
        }

    }, "btn-danger", "🛑 Encerrar Mês");
}

// ==========================================
// HISTÓRICO
// ==========================================
async function carregarOpcoesHistorico() {
    if(!selectHistorico) return;
    try {
        const snap = await getDocs(collection(db, "historico_fechamentos"));
        const referenciasUnicas = new Set();
        snap.forEach(doc => { const ref = doc.data().referencia; if(ref) referenciasUnicas.add(ref); });

        if (referenciasUnicas.size === 0) { selectHistorico.innerHTML = '<option value="">Nenhum histórico disponível</option>'; return; }

        let arrayRefs = Array.from(referenciasUnicas).reverse(); 
        let html = '<option value="">Selecione um ciclo...</option>';
        arrayRefs.forEach(ref => { html += `<option value="${ref}">${ref}</option>`; });
        selectHistorico.innerHTML = html;
    } catch (error) { console.error(error); }
}

if(selectHistorico) {
    selectHistorico.addEventListener('change', async (e) => {
        const cicloEscolhido = e.target.value;
        if (!cicloEscolhido) {
            tabelaHistorico.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">Selecione um ciclo...</td></tr>';
            return;
        }
        tabelaHistorico.innerHTML = '<tr><td colspan="5" class="text-center py-4">Buscando dados antigos... ⏳</td></tr>';
        try {
            const q = query(collection(db, "historico_fechamentos"), where("referencia", "==", cicloEscolhido));
            const snap = await getDocs(q);
            let corretoresAntigos = [];
            snap.forEach(doc => {
                let d = doc.data();
                corretoresAntigos.push({
                    nome: d.corretor, producao_pme: d.producao_final_pme || 0, producao_pf: d.producao_final_pf || 0
                });
            });
            renderizarRanking(corretoresAntigos, tabelaHistorico, true);
        } catch (error) { tabelaHistorico.innerHTML = '<tr><td colspan="5" class="text-center text-danger py-4">Erro de conexão.</td></tr>'; }
    });
}
carregarOpcoesHistorico();
