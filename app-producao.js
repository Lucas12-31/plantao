import { db } from "./firebase-config.js";
import { collection, getDocs, updateDoc, doc, onSnapshot, addDoc, increment } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const selectCorretor = document.getElementById('select-corretor');
const tabelaRanking = document.getElementById('tabela-ranking');
const form = document.getElementById('form-producao');

// 1. CARREGAR CORRETORES
onSnapshot(collection(db, "corretores"), (snapshot) => {
    let htmlOptions = '<option value="">Selecione...</option>';
    let corretores = [];

    snapshot.forEach(d => {
        corretores.push({ id: d.id, ...d.data() });
    });

    corretores.sort((a, b) => a.nome.localeCompare(b.nome));
    
    // Preenche o Select
    if(selectCorretor) {
        corretores.forEach(c => {
            htmlOptions += `<option value="${c.id}">${c.nome}</option>`;
        });
        selectCorretor.innerHTML = htmlOptions;
    }

    // Renderiza Ranking
    renderizarRanking(corretores);
});

// 2. RENDERIZAR RANKING (Mostra quem está vendendo mais NO MÊS ATUAL)
function renderizarRanking(lista) {
    if(!tabelaRanking) return;

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
        const tipo = document.getElementById('tipo-prod').value; 
        const valor = parseFloat(document.getElementById('valor-prod').value);

        if (!id || !valor) return alert("Preencha tudo!");

        const campoBanco = tipo === 'pme' ? 'producao_pme' : 'producao_pf';

        try {
            const ref = doc(db, "corretores", id);
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

// 4. FUNÇÃO DE FECHAMENTO (CORRIGIDA PARA SISTEMA RETROATIVO)
export async function iniciarNovoCiclo() {
    // Texto explicativo para evitar acidentes
    const confirmacao = confirm(
        "📅 INICIAR NOVO CICLO DE VENDAS\n\n" +
        "1. Isso vai ZERAR o Ranking de Produção (R$) para começar o novo mês.\n" +
        "2. O SALDO DE LEADS (Plantão) SERÁ MANTIDO (pois ele vem do mês anterior).\n\n" +
        "⚠️ IMPORTANTE: Certifique-se de que você já rodou a DISTRIBUIÇÃO antes de clicar aqui, senão os corretores ficarão sem meta!\n\n" +
        "Deseja continuar?"
    );

    if(!confirmacao) return;

    const senha = prompt("Digite a senha de administrador (limao123):");
    if (senha !== "limao123") return alert("Senha incorreta.");

    try {
        const snapshot = await getDocs(collection(db, "corretores"));
        const dataHoje = new Date().toLocaleDateString('pt-BR');
        
        // Loop para zerar produção
        for (const d of snapshot.docs) {
            const dados = d.data();
            
            // 1. Salva backup do que foi vendido no mês que passou
            await addDoc(collection(db, "historico_fechamentos"), {
                data_fechamento: new Date(),
                referencia: `Ciclo encerrado em ${dataHoje}`,
                corretor: dados.nome,
                producao_final_pme: dados.producao_pme,
                producao_final_pf: dados.producao_pf
            });

            // 2. Zera APENAS a produção (Vendas). 
            // O SALDO (Leads a receber) é preservado para o plantão rodar.
            await updateDoc(doc(db, "corretores", d.id), {
                producao_pme: 0,
                producao_pf: 0
                // NÃO ZERAMOS saldo_pme nem saldo_pf AQUI!
            });
        }

        alert("✅ Novo ciclo iniciado!\n\nO Ranking foi zerado para as novas vendas.\nO Plantão continua rodando com o saldo da distribuição anterior.");
        
    } catch (error) {
        console.error("Erro ao fechar ciclo:", error);
        alert("Erro ao processar.");
    }
}

// Torna global
window.encerrarMes = iniciarNovoCiclo;
