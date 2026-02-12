import { db } from "./firebase-config.js";
import { collection, getDocs, updateDoc, doc, onSnapshot, addDoc, increment } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const selectCorretor = document.getElementById('select-corretor');
const tabelaRanking = document.getElementById('tabela-ranking');
const form = document.getElementById('form-producao');

// 1. CARREGAR CORRETORES (Para o Select e Tabela)
onSnapshot(collection(db, "corretores"), (snapshot) => {
    let htmlOptions = '<option value="">Selecione...</option>';
    let corretores = [];

    snapshot.forEach(d => {
        corretores.push({ id: d.id, ...d.data() });
    });

    // Ordena Select por nome
    corretores.sort((a, b) => a.nome.localeCompare(b.nome));
    corretores.forEach(c => {
        htmlOptions += `<option value="${c.id}">${c.nome}</option>`;
    });
    if(selectCorretor) selectCorretor.innerHTML = htmlOptions;

    // Renderiza Ranking
    renderizarRanking(corretores);
});

// 2. FUNÇÃO RENDERIZAR RANKING
function renderizarRanking(lista) {
    if(!tabelaRanking) return;

    // Calcula total e pontos para ordenar
    lista.forEach(c => {
        c.v_pme = parseFloat(c.producao_pme) || 0;
        c.v_pf = parseFloat(c.producao_pf) || 0;
        c.totalMoney = c.v_pme + c.v_pf;
        c.pontos = (c.v_pme * 2) + c.v_pf;
    });

    // Ordena por Pontos (Do maior para o menor)
    lista.sort((a, b) => b.pontos - a.pontos);

    let html = '';
    const fmtMoney = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    lista.forEach((c, index) => {
        let medalha = "";
        if (index === 0) medalha = "🥇";
        if (index === 1) medalha = "🥈";
        if (index === 2) medalha = "🥉";

        html += `
            <tr>
                <td class="text-start ps-4 fw-bold">${medalha} ${c.nome}</td>
                <td class="text-warning fw-bold">${fmtMoney(c.v_pme)}</td>
                <td class="text-info fw-bold">${fmtMoney(c.v_pf)}</td>
                <td>${fmtMoney(c.totalMoney)}</td>
                <td><span class="badge bg-dark">${Math.floor(c.pontos)} pts</span></td>
            </tr>
        `;
    });
    tabelaRanking.innerHTML = html;
}

// 3. LANÇAR PRODUÇÃO
if(form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id = selectCorretor.value;
        const tipo = document.getElementById('tipo-prod').value; // 'pme' ou 'pf'
        const valor = parseFloat(document.getElementById('valor-prod').value);

        if (!id || !valor) return alert("Preencha tudo!");

        const campoBanco = tipo === 'pme' ? 'producao_pme' : 'producao_pf';

        try {
            const ref = doc(db, "corretores", id);
            // Incrementa o valor existente
            await updateDoc(ref, {
                [campoBanco]: increment(valor)
            });
            alert(`R$ ${valor} adicionado com sucesso!`);
            form.reset();
        } catch (error) {
            console.error(error);
            alert("Erro ao lançar.");
        }
    });
}

// 4. FUNÇÃO MESTRA: ENCERRAR MÊS (ZERA TUDO)
export async function encerrarMes() {
    if(!confirm("⚠️ ATENÇÃO EXTREMA ⚠️\n\nIsso irá ZERAR a produção e o saldo de leads de TODOS os corretores para iniciar um novo mês.\n\nO Plantão ficará vazio até que nova produção seja lançada e distribuída.\n\nTem certeza absoluta?")) {
        return;
    }

    const senha = prompt("Digite a senha de administrador para confirmar (Digite: limao123):");
    if (senha !== "limao123") return alert("Senha incorreta.");

    try {
        const snapshot = await getDocs(collection(db, "corretores"));
        
        // Salvar Histórico (Snapshot do fechamento) - Opcional mas recomendado
        const dataHoje = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
        
        // Loop para zerar um por um
        for (const d of snapshot.docs) {
            const dados = d.data();
            
            // 1. Salva backup na coleção 'historico_fechamentos'
            await addDoc(collection(db, "historico_fechamentos"), {
                data: new Date(),
                mes_referencia: dataHoje,
                corretor: dados.nome,
                producao_final_pme: dados.producao_pme,
                producao_final_pf: dados.producao_pf,
                pontos_finais: (dados.producao_pme * 2) + dados.producao_pf
            });

            // 2. Zera o corretor
            await updateDoc(doc(db, "corretores", d.id), {
                producao_pme: 0,
                producao_pf: 0,
                saldo_pme: 0,   // Zera a meta de leads PME a receber
                saldo_pf: 0,    // Zera a meta de leads PF a receber
                leads_entregues_pme: 0,
                leads_entregues_pf: 0
            });
        }

        alert("✅ Mês encerrado com sucesso! \n\nO ranking e o plantão foram reiniciados.");
        
    } catch (error) {
        console.error("Erro ao fechar mês:", error);
        alert("Erro ao processar o fechamento.");
    }
}

// Torna global para o botão HTML acessar
window.encerrarMes = encerrarMes;
