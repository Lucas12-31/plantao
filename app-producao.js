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
// VARIÁVEIS GLOBAIS DE ORDENAÇÃO
// ==========================================
let listaCorretoresAtual = [];
let criterioOrdenacao = 'pontos'; // Padrão: 'pontos', mas aceita 'pme', 'pf' ou 'total'
let ordemDecrescente = true;

// ==========================================
// FUNÇÕES DE APOIO (ALERTAS BONITOS)
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
// FUNÇÃO DE ORDENAÇÃO DINÂMICA
// ==========================================
window.ordenarTabela = (criterio) => {
    if (criterioOrdenacao === criterio) {
        ordemDecrescente = !ordemDecrescente; // Inverte se clicar na mesma coluna
    } else {
        criterioOrdenacao = criterio;
        ordemDecrescente = true; // Volta para o decrescente se mudar de coluna
    }
    
    // Reseta visual das setinhas
    document.getElementById('seta-pme').innerText = '';
    document.getElementById('seta-pme').className = 'text-muted ms-1';
    document.getElementById('seta-pf').innerText = '';
    document.getElementById('seta-pf').className = 'text-muted ms-1';
    document.getElementById('seta-total').innerText = '';
    document.getElementById('seta-total').className = 'text-muted ms-1';
    document.getElementById('seta-pontos').innerText = '';
    document.getElementById('seta-pontos').className = 'text-muted ms-1';
    
    // Destaca a seta ativa
    const seta = ordemDecrescente ? '▼' : '▲';
    const el = document.getElementById(`seta-${criterio}`);
    if (el) {
        el.innerText = seta;
        el.className = 'text-dark ms-1 fw-bold';
    }

    // Re-renderiza a tabela
    renderizarRanking(listaCorretoresAtual, tabelaRanking, false);
};

// ==========================================
// INICIALIZAÇÃO DA TABELA (COM FILTRO)
// ==========================================
onSnapshot(collection(db, "corretores"), (snapshot) => {
    let corretores = [];
    snapshot.forEach(d => {
        let dados = d.data();
        if (dados.ativo !== false) { // Filtro: Só mostra ativos na equipe
            corretores.push({ id: d.id, ...dados });
        }
    });

    corretores.sort((a, b) => a.nome.localeCompare(b.nome));
    
    if(selectCorretor) {
        let htmlOptions = '<option value="">Selecione...</option>';
        corretores.forEach(c => { htmlOptions += `<option value="${c.id}">${c.nome}</option>`; });
        selectCorretor.innerHTML = htmlOptions;
    }

    // Salva a lista na variável global para poder ordenar depois sem recarregar banco
    listaCorretoresAtual = corretores;
    renderizarRanking(listaCorretoresAtual, tabelaRanking, false);
});

// ==========================================
// RENDERIZAÇÃO OTIMIZADA
// ==========================================
function renderizarRanking(lista, elementoTabela, ehHistorico = false) {
    if(!elementoTabela) return;

    // Calcula os valores antes de ordenar
    lista.forEach(c => {
        c.v_pme = parseFloat(c.producao_pme) || 0;
        c.v_pf = parseFloat(c.producao_pf) || 0;
        c.totalMoney = c.v_pme + c.v_pf;
        c.pontos = (c.v_pme * 2) + c.v_pf;
        c.isParticipante = c.participa_plantao !== false; 
        c.leadsPmeCalculados = (c.isParticipante && c.totalMoney >= 3000) ? 1 + Math.floor(c.v_pme / 2000) : 0;
    });

    // Ordenação dinâmica aplicando o critério escolhido
    lista.sort((a, b) => {
        let valA, valB;
        if (criterioOrdenacao === 'pme') { valA = a.v_pme; valB = b.v_pme; }
        else if (criterioOrdenacao === 'pf') { valA = a.v_pf; valB = b.v_pf; }
        else if (criterioOrdenacao === 'total') { valA = a.totalMoney; valB = b.totalMoney; }
        else { valA = a.pontos; valB = b.pontos; } // Default: pontos

        return ordemDecrescente ? (valB - valA) : (valA - valB);
    });

    let html = '';
    const fmtMoney = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    lista.forEach((c, index) => {
        let medalha = index < 3 && c.pontos > 0 ? ["🥇", "🥈", "🥉"][index] : "";
        let recPme = parseInt(c.leads_recebidos_pme) || 0;
        let recPf = parseInt(c.leads_recebidos_pf) || 0;

        html += `
            <tr class="${!c.isParticipante ? 'bg-light text-muted' : ''}">
                <td class="text-start ps-3 fw-bold text-uppercase">${medalha} ${c.nome}</td>
                <td>${fmtMoney(c.v_pme)}</td>
                <td>${fmtMoney(c.v_pf)}</td>
                <td>${fmtMoney(c.totalMoney)}</td>
                ${ehHistorico ? `
                    <td class="text-muted fw-bold">${c.mes_competencia || '-'}</td>
                ` : `
                    <td><span class="badge bg-dark">${Math.floor(c.pontos)}</span></td>
                    <td class="bg-warning fw-bold">${c.leadsPmeCalculados}</td>
                    <td class="bg-info text-white fw-bold">${recPme}</td>
                    <td class="bg-primary text-white fw-bold">${recPf}</td>
                    <td style="font-size: 0.75rem;">${c.mes_competencia || '-'}</td>
                    <td>
                        <div class="d-flex justify-content-center gap-1">
                            <button onclick="togglePlantaoStatus('${c.id}', '${c.nome}', ${c.isParticipante})" class="btn btn-sm btn-outline-${c.isParticipante ? 'success' : 'danger'} p-1" style="font-size: 0.7rem;" title="Status Plantão">${c.isParticipante ? '🟢' : '🔴'}</button>
                            <button onclick="abrirModalEditarProducao('${c.id}', '${c.nome}', ${c.v_pme}, ${c.v_pf}, '${c.mes_competencia || ''}', ${recPme}, ${recPf})" class="btn btn-sm btn-outline-warning p-1" style="font-size: 0.7rem;" title="Editar">✏️</button>
                            <button onclick="zerarProducaoCorretor('${c.id}', '${c.nome}')" class="btn btn-sm btn-outline-dark p-1" style="font-size: 0.7rem;" title="Zerar">🗑️</button>
                        </div>
                    </td>
                `}
            </tr>
        `;
    });
    elementoTabela.innerHTML = html || '<tr><td colspan="10" class="text-center py-4 text-muted">Nenhum dado encontrado.</td></tr>';
}

// ==========================================
// AÇÕES: STATUS, EDIÇÃO E ZERAR
// ==========================================
window.togglePlantaoStatus = async (id, nome, participaAtual) => {
    window.mostrarConfirmacao("Status Plantão", `Deseja ${participaAtual ? 'SUSPENDER' : 'PERMITIR'} o corretor <b>${nome}</b> no plantão?`, async () => {
        await updateDoc(doc(db, "corretores", id), { participa_plantao: !participaAtual });
    }, participaAtual ? 'btn-danger' : 'btn-success', participaAtual ? '🔴 Suspender' : '🟢 Permitir');
};

window.abrirModalEditarProducao = (id, nome, pme, pf, mes, recPme, recPf) => {
    document.getElementById('edit-prod-id').value = id;
    document.getElementById('edit-prod-nome').innerText = nome;
    document.getElementById('edit-prod-pme').value = pme;
    document.getElementById('edit-prod-pf').value = pf;
    document.getElementById('edit-prod-mes').value = mes;
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
    
    await updateDoc(doc(db, "corretores", id), {
        producao_pme: novoPme, producao_pf: novoPf, mes_competencia: novoMes,
        leads_recebidos_pme: novoRecPme, leads_recebidos_pf: novoRecPf
    });
    bootstrap.Modal.getInstance(document.getElementById('modal-editar-producao')).hide();
    window.mostrarAlerta("Atualizado", "Dados salvos com sucesso.");
};

window.zerarProducaoCorretor = async (id, nome) => {
    window.mostrarConfirmacao("Zerar Produção", `⚠️ ZERAR produção de <b>${nome}</b>?`, async () => {
        await updateDoc(doc(db, "corretores", id), {
            producao_pme: 0, producao_pf: 0, leads_ganhos_pme: 0, leads_recebidos_pme: 0, leads_recebidos_pf: 0, mes_competencia: "" 
        });
    }, 'btn-danger', '🗑️ Sim, Zerar');
};

// ==========================================
// HISTÓRICO E NOVO CICLO
// ==========================================
export async function iniciarNovoCiclo() {
    let msg = `Isso salvará a produção no histórico e zerará todos os totais.<br><br><b>Senha Admin:</b><br><input type="password" id="input-senha-ciclo" class="form-control mt-2 text-center" placeholder="******">`;
    window.mostrarConfirmacao("📅 Iniciar Novo Ciclo", msg, async () => {
        if (document.getElementById('input-senha-ciclo').value !== "limao123") return window.mostrarAlerta("Erro", "Senha incorreta.");
        const snapshot = await getDocs(collection(db, "corretores"));
        for (const d of snapshot.docs) {
            const dados = d.data();
            if(dados.producao_pme > 0 || dados.producao_pf > 0) {
                await addDoc(collection(db, "historico_fechamentos"), {
                    data_fechamento: new Date().toISOString(),
                    corretor: dados.nome, 
                    producao_final_pme: dados.producao_pme, 
                    producao_final_pf: dados.producao_pf,
                    mes_competencia: dados.mes_competencia || "",
                    referencia: dados.mes_competencia || ""
                });
            }
            await updateDoc(doc(db, "corretores", d.id), { producao_pme: 0, producao_pf: 0, leads_recebidos_pme: 0, leads_recebidos_pf: 0, mes_competencia: "" });
        }
        window.mostrarAlerta("Sucesso", "Novo ciclo iniciado!");
        carregarOpcoesHistorico();
    }, 'btn-danger', '🛑 Encerrar Mês');
}

async function carregarOpcoesHistorico() {
    if(!selectHistorico) return;
    const snap = await getDocs(collection(db, "historico_fechamentos"));
    const refs = new Set();
    snap.forEach(d => { if(d.data().referencia) refs.add(d.data().referencia); });
    let html = '<option value="">Selecione...</option>';
    Array.from(refs).reverse().forEach(r => html += `<option value="${r}">${r}</option>`);
    selectHistorico.innerHTML = html;
}

if(selectHistorico) {
    selectHistorico.addEventListener('change', async (e) => {
        const snap = await getDocs(query(collection(db, "historico_fechamentos"), where("referencia", "==", e.target.value)));
        let hist = [];
        snap.forEach(d => hist.push({ 
            nome: d.data().corretor, 
            producao_pme: d.data().producao_final_pme, 
            producao_pf: d.data().producao_final_pf,
            mes_competencia: d.data().mes_competencia || d.data().referencia || '-'
        }));
        // O histórico também obedece a ordenação escolhida nos botões!
        renderizarRanking(hist, tabelaHistorico, true);
    });
}

form.addEventListener('submit', async (e) => {
    e.preventDefault(); 

    const idCorretor = document.getElementById('select-corretor').value;
    const mesRef = document.getElementById('mes-referencia').value;
    const valorPme = parseFloat(document.getElementById('valor-pme').value) || 0;
    const valorPf = parseFloat(document.getElementById('valor-pf').value) || 0;

    if (!idCorretor) {
        window.mostrarAlerta("Erro", "Por favor, selecione um corretor.");
        return;
    }

    try {
        const docRef = doc(db, "corretores", idCorretor);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const dadosAtuais = docSnap.data();
            
            await updateDoc(docRef, {
                producao_pme: (parseFloat(dadosAtuais.producao_pme) || 0) + valorPme,
                producao_pf: (parseFloat(dadosAtuais.producao_pf) || 0) + valorPf,
                mes_competencia: mesRef
            });

            bootstrap.Modal.getInstance(document.getElementById('modal-lancar-producao')).hide();
            form.reset();
            window.mostrarAlerta("Sucesso", "Produção lançada com sucesso!");
        }
    } catch (error) {
        console.error("Erro ao salvar:", error);
        window.mostrarAlerta("Erro", "Não foi possível salvar os dados.");
    }
});
carregarOpcoesHistorico();
