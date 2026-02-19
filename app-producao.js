import { db } from "./firebase-config.js";
import { collection, getDocs, updateDoc, doc, onSnapshot, addDoc, increment, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const selectCorretor = document.getElementById('select-corretor');
const tabelaRanking = document.getElementById('tabela-ranking');
const form = document.getElementById('form-producao');

// Preenche o campo de Mês com o mês atual automaticamente ao abrir a tela
const inputMes = document.getElementById('mes-referencia');
if(inputMes) {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    inputMes.value = `${ano}-${mes}`; // Formato que o input type="month" exige
}

// Elementos do Histórico
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

    renderizarRanking(corretores, tabelaRanking);
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
        if (index === 0) medalha = "🥇";
        if (index === 1) medalha = "🥈";
        if (index === 2) medalha = "🥉";

        let corBadge = ehHistorico ? 'bg-secondary' : 'bg-dark';

        html += `
            <tr>
                <td class="text-start ps-4 fw-bold text-uppercase">${medalha} ${c.nome}</td>
                <td class="text-warning fw-bold">${fmtMoney(c.v_pme)}</td>
                <td class="text-info fw-bold">${fmtMoney(c.v_pf)}</td>
                <td>${fmtMoney(c.totalMoney)}</td>
                <td><span class="badge ${corBadge}">${Math.floor(c.pontos)} pts</span></td>
            </tr>
        `;
    });
    
    if(html === '') html = '<tr><td colspan="5" class="text-center text-muted py-4">Nenhum dado encontrado.</td></tr>';
    elementoTabela.innerHTML = html;
}

// ========================================================
// 2. LANÇAR PRODUÇÃO DO MÊS ATUAL (COM AUDITORIA)
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
            // A. Cria um "recibo" do lançamento para auditoria e histórico
            await addDoc(collection(db, "lancamentos_producao"), {
                corretor_id: id,
                corretor_nome: nomeCorretor,
                tipo_produto: tipo,
                valor_lancado: valor,
                mes_competencia: mesRef, // <-- AQUI FICA SALVO O MÊS!
                data_lancamento: new Date().toISOString()
            });

            // B. Incrementa o saldo do ranking atual do corretor
            const ref = doc(db, "corretores", id);
            await updateDoc(ref, {
                [campoBanco]: increment(valor)
            });
            
            alert(`R$ ${valor} adicionado com sucesso para a competência ${mesRef}!`);
            
            // Limpa apenas o valor, mantendo o corretor e o mês selecionados para facilitar múltiplos lançamentos
            document.getElementById('valor-prod').value = ''; 
        } catch (error) {
            console.error(error);
            alert("Erro ao lançar.");
        }
    });
}

// ========================================================
// 3. FUNÇÃO DE FECHAMENTO (SALVA HISTÓRICO E ZERA)
// ========================================================
export async function iniciarNovoCiclo() {
    const confirmacao = confirm(
        "📅 INICIAR NOVO CICLO DE VENDAS\n\n" +
        "1. Isso vai SALVAR O RANKING ATUAL no histórico.\n" +
        "2. Depois, vai ZERAR o Ranking (R$) para o novo mês.\n" +
        "3. O SALDO DE LEADS (Distribuição/Plantão) SERÁ MANTIDO intacto.\n\n" +
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
// 4. LER E EXIBIR HISTÓRICO ANTERIOR
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

        let html = '<option value="">Selecione um ciclo...</option>';
        Array.from(referenciasUnicas).forEach(ref => {
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
