import { db } from "./firebase-config.js";
import { collection, getDocs, getDoc, updateDoc, doc, onSnapshot, addDoc, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const selectCorretor = document.getElementById('select-corretor');
const tabelaRanking = document.getElementById('tabela-ranking');
const form = document.getElementById('form-producao');

const inputMes = document.getElementById('mes-referencia');
if(inputMes) {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    inputMes.value = `${ano}-${mes}`; 
}

const selectHistorico = document.getElementById('select-historico');
const tabelaHistorico = document.getElementById('tabela-historico');

onSnapshot(collection(db, "corretores"), (snapshot) => {
    let htmlOptions = '<option value="">Selecione...</option>';
    let corretores = [];

    snapshot.forEach(d => {
        corretores.push({ id: d.id, ...d.data() });
    });

    corretores.sort((a, b) => a.nome.localeCompare(b.nome));
    
    if(selectCorretor) {
        corretores.forEach(c => {
            htmlOptions += `<option value="${c.id}">${c.nome}</option>`;
        });
        selectCorretor.innerHTML = htmlOptions;
    }

    renderizarRanking(corretores, tabelaRanking, false);
});

function renderizarRanking(lista, elementoTabela, ehHistorico = false) {
    if(!elementoTabela) return;

    lista.forEach(c => {
        c.v_pme = parseFloat(c.producao_pme) || 0;
        c.v_pf = parseFloat(c.producao_pf) || 0;
        c.totalMoney = c.v_pme + c.v_pf;
        c.pontos = (c.v_pme * 2) + c.v_pf;
        
        c.leadsPmeCalculados = 0;
        c.isAtivo = c.elegivel !== false; 

        if (c.isAtivo && c.totalMoney >= 3000) {
            c.leadsPmeCalculados = 1 + Math.floor(c.v_pme / 2000);
        }
    });

    lista.sort((a, b) => b.pontos - a.pontos);

    let html = '';
    const fmtMoney = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    lista.forEach((c, index) => {
        let medalha = "";
        if (index === 0 && c.pontos > 0) medalha = "🥇";
        if (index === 1 && c.pontos > 0) medalha = "🥈";
        if (index === 2 && c.pontos > 0) medalha = "🥉";

        let corBadge = ehHistorico ? 'bg-secondary' : 'bg-dark';
        let compFormatada = "-";
        if (c.mes_competencia) {
            const [ano, mes] = c.mes_competencia.split('-');
            compFormatada = `${mes}/${ano}`;
        }
        
        let leadsGanhosHtml = ehHistorico ? '' : `<td class="bg-warning fw-bold fs-5 border-start border-white">${c.leadsPmeCalculados}</td>`;
        if (!ehHistorico && !c.isAtivo) {
            leadsGanhosHtml = `<td class="bg-light text-danger fw-bold border-start border-white"><small>Suspenso</small></td>`;
        }

        let leadsRecPme = parseInt(c.leads_recebidos_pme) || 0;
        let leadsRecPf = parseInt(c.leads_recebidos_pf) || 0;
        
        let recPmeHtml = ehHistorico ? '' : `<td class="bg-info text-white fw-bold fs-5">${leadsRecPme}</td>`;
        let recPfHtml = ehHistorico ? '' : `<td class="bg-primary text-white fw-bold fs-5 border-end border-white">${leadsRecPf}</td>`;

        let colunaCompetenciaHtml = ehHistorico ? '' : `<td><span class="badge bg-light text-dark border shadow-sm">${compFormatada}</span></td>`;

        let acoesHtml = '';
        if (!ehHistorico) {
            let btnStatus = c.isAtivo 
                ? `<button onclick="toggleElegibilidade('${c.id}', '${c.nome}', true, ${c.v_pme}, ${c.v_pf})" class="btn btn-sm btn-outline-success p-1 px-2 shadow-sm me-1" title="Corretor Ativo. Clique para Suspender">🟢</button>`
                : `<button onclick="toggleElegibilidade('${c.id}', '${c.nome}', false, ${c.v_pme}, ${c.v_pf})" class="btn btn-sm btn-outline-danger p-1 px-2 shadow-sm me-1" title="Corretor Suspenso. Clique para Ativar">🔴</button>`;

            // NOVO: Passando os valores de leads recebidos para a função do lápis
            acoesHtml = `
                <td>
                    <div class="d-flex flex-nowrap justify-content-center">
                        ${btnStatus}
                        <button onclick="abrirModalEditarProducao('${c.id}', '${c.nome}', ${c.v_pme}, ${c.v_pf}, '${c.mes_competencia || ''}', ${leadsRecPme}, ${leadsRecPf})" class="btn btn-sm btn-outline-warning p-1 px-2 shadow-sm me-1" title="Ajustar Valores">✏️</button>
                        <button onclick="zerarProducaoCorretor('${c.id}', '${c.nome}')" class="btn btn-sm btn-outline-dark p-1 px-2 shadow-sm" title="Zerar Tudo">🗑️</button>
                    </div>
                </td>
            `;
        }

        html += `
            <tr class="${!c.isAtivo && !ehHistorico ? 'opacity-50' : ''}">
                <td class="text-start ps-4 fw-bold text-uppercase">${medalha} ${c.nome}</td>
                <td class="text-warning fw-bold">${fmtMoney(c.v_pme)}</td>
                <td class="text-info fw-bold">${fmtMoney(c.v_pf)}</td>
                <td class="fw-bold text-secondary">${fmtMoney(c.totalMoney)}</td>
                <td><span class="badge ${corBadge} shadow-sm">${Math.floor(c.pontos)} pts</span></td>
                ${leadsGanhosHtml}
                ${recPmeHtml}
                ${recPfHtml}
                ${colunaCompetenciaHtml}
                ${acoesHtml}
            </tr>
        `;
    });
    
    if(html === '') {
        let colspan = ehHistorico ? 5 : 10;
        html = `<tr><td colspan="${colspan}" class="text-center text-muted py-4">Nenhum dado encontrado.</td></tr>`;
    }
    
    elementoTabela.innerHTML = html;
}

if(form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id = selectCorretor.value;
        const nomeCorretor = selectCorretor.options[selectCorretor.selectedIndex].text;
        const mesRef = document.getElementById('mes-referencia').value;
        const valorPme = parseFloat(document.getElementById('valor-pme').value) || 0;
        const valorPf = parseFloat(document.getElementById('valor-pf').value) || 0;

        if (!id || !mesRef) return alert("Preencha o corretor e o mês!");
        if (valorPme <= 0 && valorPf <= 0) return alert("Preencha um valor PME ou PF!");

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
            
            alert(`✅ Produção salva! A meta de leads foi recalculada.`);
            
            document.getElementById('valor-pme').value = ''; 
            document.getElementById('valor-pf').value = ''; 
            
            const modalEl = document.getElementById('modal-lancar-producao');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if(modal) modal.hide();
        } catch (error) { console.error(error); alert("Erro ao lançar."); }
    });
}

// NOVO: A função agora aceita recPme e recPf e joga nos inputs da janelinha
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

// NOVO: A função agora capta o que você digitou de leads recebidos e manda pro banco
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
    } catch (error) { console.error(error); alert("Erro ao atualizar a produção."); }
};

window.zerarProducaoCorretor = async (id, nome) => {
    if(confirm(`⚠️ ZERAR toda a produção e leads recebidos de ${nome} neste mês?`)) {
        try {
            await updateDoc(doc(db, "corretores", id), {
                producao_pme: 0, producao_pf: 0, leads_ganhos_pme: 0, leads_recebidos_pme: 0, leads_recebidos_pf: 0, mes_competencia: "" 
            });
        } catch (error) { console.error(error); }
    }
};

window.toggleElegibilidade = async (id, nome, statusAtual, pme, pf) => {
    let novoStatus = !statusAtual;
    let acao = novoStatus ? "ATIVAR" : "SUSPENDER";
    if(confirm(`Deseja ${acao} o corretor ${nome} do recebimento de Leads?`)) {
        try {
            let leadsGanhos = 0;
            let total = pme + pf;
            if (novoStatus && total >= 3000) { leadsGanhos = 1 + Math.floor(pme / 2000); }
            await updateDoc(doc(db, "corretores", id), { elegivel: novoStatus, leads_ganhos_pme: leadsGanhos });
        } catch(e) { console.error(e); }
    }
};

export async function iniciarNovoCiclo() {
    const confirmacao = confirm(
        "📅 INICIAR NOVO CICLO DE VENDAS\n\n" +
        "1. Salva a Produção Atual no Histórico.\n" +
        "2. ZERA os Totais Financeiros E OS LEADS RECEBIDOS para o novo mês.\n\n" +
        "Deseja continuar?"
    );

    if(!confirmacao) return;

    const senha = prompt("Digite a senha de administrador (limao123):");
    if (senha !== "limao123") return alert("Senha incorreta.");

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
        alert("✅ Novo ciclo iniciado! O histórico foi salvo e a roleta zerada.");
        carregarOpcoesHistorico(); 
    } catch (error) { console.error(error); }
}

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
        } catch (error) { tabelaHistorico.innerHTML = '<tr><td colspan="5" class="text-center text-danger py-4">Erro.</td></tr>'; }
    });
}
carregarOpcoesHistorico();
