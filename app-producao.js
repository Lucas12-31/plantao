import { db } from "./firebase-config.js";
import { collection, getDocs, updateDoc, doc, onSnapshot, addDoc, increment, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

// ========================================================
// 1. CARREGAR E RENDERIZAR O MÊS ATUAL
// ========================================================
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

        // SE FOR O MÊS ATUAL, CRIA A COLUNA DE AÇÕES
        let acoesHtml = '';
        if (!ehHistorico) {
            acoesHtml = `
                <td>
                    <button onclick="abrirModalEditarProducao('${c.id}', '${c.nome}', ${c.v_pme}, ${c.v_pf})" class="btn btn-sm btn-outline-warning shadow-sm me-1" title="Ajustar Produção Manualmente">✏️</button>
                    <button onclick="zerarProducaoCorretor('${c.id}', '${c.nome}')" class="btn btn-sm btn-outline-danger shadow-sm" title="Zerar / Excluir Produção do Mês">🗑️</button>
                </td>
            `;
        }

        html += `
            <tr>
                <td class="text-start ps-4 fw-bold text-uppercase">${medalha} ${c.nome}</td>
                <td class="text-warning fw-bold">${fmtMoney(c.v_pme)}</td>
                <td class="text-info fw-bold">${fmtMoney(c.v_pf)}</td>
                <td class="fw-bold text-secondary">${fmtMoney(c.totalMoney)}</td>
                <td><span class="badge ${corBadge} shadow-sm">${Math.floor(c.pontos)} pts</span></td>
                ${acoesHtml}
            </tr>
        `;
    });
    
    if(html === '') {
        let colspan = ehHistorico ? 5 : 6;
        html = `<tr><td colspan="${colspan}" class="text-center text-muted py-4">Nenhum dado encontrado.</td></tr>`;
    }
    
    elementoTabela.innerHTML = html;
}

// ========================================================
// 2. LANÇAR PRODUÇÃO DO MÊS ATUAL (SOMA NORMAL)
// ========================================================
if(form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id = selectCorretor.value;
        const nomeCorretor = selectCorretor.options[selectCorretor.selectedIndex].text;
        const tipo = document.getElementById('tipo-prod').value; 
        const valor = parseFloat(document.getElementById('valor-prod').value);
        const mesRef = document.getElementById('mes-referencia').value;

        if (!id || !valor || !mesRef) return alert("Preencha todos os campos!");

        const campoBanco = tipo === 'pme' ? 'producao_pme' : 'producao_pf';

        try {
            await addDoc(collection(db, "lancamentos_producao"), {
                corretor_id: id,
                corretor_nome: nomeCorretor,
                tipo_produto: tipo,
                valor_lancado: valor,
                mes_competencia: mesRef, 
                data_lancamento: new Date().toISOString()
            });

            const ref = doc(db, "corretores", id);
            await updateDoc(ref, {
                [campoBanco]: increment(valor)
            });
            
            alert(`✅ R$ ${valor} adicionado com sucesso para a competência ${mesRef}!`);
            document.getElementById('valor-prod').value = ''; 
        } catch (error) {
            console.error(error);
            alert("Erro ao lançar.");
        }
    });
}

// ========================================================
// 3. EDIÇÃO MANUAL E ZERAR PRODUÇÃO (NOVAS FUNÇÕES)
// ========================================================

window.abrirModalEditarProducao = (id, nome, pmeAtual, pfAtual) => {
    document.getElementById('edit-prod-id').value = id;
    document.getElementById('edit-prod-nome').innerText = nome;
    document.getElementById('edit-prod-pme').value = pmeAtual;
    document.getElementById('edit-prod-pf').value = pfAtual;
    
    new bootstrap.Modal(document.getElementById('modal-editar-producao')).show();
};

window.salvarEdicaoProducao = async () => {
    const id = document.getElementById('edit-prod-id').value;
    const novoPme = parseFloat(document.getElementById('edit-prod-pme').value) || 0;
    const novoPf = parseFloat(document.getElementById('edit-prod-pf').value) || 0;

    try {
        await updateDoc(doc(db, "corretores", id), {
            producao_pme: novoPme,
            producao_pf: novoPf
        });
        
        bootstrap.Modal.getInstance(document.getElementById('modal-editar-producao')).hide();
    } catch (error) {
        console.error("Erro ao salvar edição:", error);
        alert("Erro ao atualizar a produção.");
    }
};

window.zerarProducaoCorretor = async (id, nome) => {
    if(confirm(`⚠️ ATENÇÃO:\n\nTem certeza que deseja ZERAR toda a produção de ${nome} neste mês?\nIsso removerá os pontos dele do ranking atual.`)) {
        try {
            await updateDoc(doc(db, "corretores", id), {
                producao_pme: 0,
                producao_pf: 0
            });
        } catch (error) {
            console.error("Erro ao zerar:", error);
            alert("Erro ao zerar produção.");
        }
    }
};

// ========================================================
// 4. FUNÇÃO DE FECHAMENTO (SALVA HISTÓRICO E ZERA GERAL)
// ========================================================
export async function iniciarNovoCiclo() {
    const confirmacao = confirm(
        "📅 INICIAR NOVO CICLO DE VENDAS\n\n" +
        "1. Isso vai SALVAR O RANKING ATUAL no histórico.\n" +
        "2. Depois, vai ZERAR o Ranking (R$) de todos para o novo mês.\n" +
        "3. O SALDO DE LEADS (Distribuição) SERÁ MANTIDO intacto.\n\n" +
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
                    data_fechamento: new Date().toISOString(),
                    referencia: referenciaCiclo,
                    corretor: dados.nome,
                    producao_final_pme: dados.producao_pme,
                    producao_final_pf: dados.producao_pf
                });
            }

            await updateDoc(doc(db, "corretores", d.id), {
                producao_pme: 0,
                producao_pf: 0
            });
        }

        alert("✅ Novo ciclo iniciado! O histórico foi salvo com sucesso.");
        carregarOpcoesHistorico(); 
        
    } catch (error) {
        console.error("Erro ao fechar ciclo:", error);
        alert("Erro ao processar.");
    }
}

// ========================================================
// 5. LER E EXIBIR HISTÓRICO ANTERIOR
// ========================================================
async function carregarOpcoesHistorico() {
    if(!selectHistorico) return;

    try {
        const snap = await getDocs(collection(db, "historico_fechamentos"));
        
        const referenciasUnicas = new Set();
        snap.forEach(doc => {
            const ref = doc.data().referencia;
            if(ref) referenciasUnicas.add(ref);
        });

        if (referenciasUnicas.size === 0) {
            selectHistorico.innerHTML = '<option value="">Nenhum histórico disponível</option>';
            return;
        }

        // Ordena por ordem de criação (o mais recente aparece primeiro/último dependendo da string)
        let arrayRefs = Array.from(referenciasUnicas).reverse(); 

        let html = '<option value="">Selecione um ciclo...</option>';
        arrayRefs.forEach(ref => {
            html += `<option value="${ref}">${ref}</option>`;
        });
        
        selectHistorico.innerHTML = html;
    } catch (error) {
        console.error("Erro ao carregar histórico:", error);
    }
}

if(selectHistorico) {
    selectHistorico.addEventListener('change', async (e) => {
        const cicloEscolhido = e.target.value;
        
        if (!cicloEscolhido) {
            tabelaHistorico.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">Selecione um ciclo acima para visualizar.</td></tr>';
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
                    nome: d.corretor,
                    producao_pme: d.producao_final_pme || 0,
                    producao_pf: d.producao_final_pf || 0
                });
            });

            renderizarRanking(corretoresAntigos, tabelaHistorico, true);

        } catch (error) {
            console.error("Erro ao carregar tabela do histórico:", error);
            tabelaHistorico.innerHTML = '<tr><td colspan="5" class="text-center text-danger py-4">Erro ao buscar dados.</td></tr>';
        }
    });
}

carregarOpcoesHistorico();
