import { db } from "./firebase-config.js";
import { collection, onSnapshot, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const selectCorretor = document.getElementById('select-corretor');
const form = document.getElementById('form-producao');
const tabela = document.getElementById('tabela-ranking');

let listaCorretores = [];

// 1. CARREGAR DADOS E GERAR RANKING
onSnapshot(collection(db, "corretores"), (snapshot) => {
    listaCorretores = [];
    selectCorretor.innerHTML = '<option value="">Selecione um corretor...</option>';
    
    snapshot.forEach(doc => {
        const dados = doc.data();
        const id = doc.id;
        
        const valorPME = parseFloat(dados.producao_pme) || 0;
        const valorPF = parseFloat(dados.producao_pf) || 0;

        // --- CÁLCULO DA PONTUAÇÃO (NOVA REGRA) ---
        // PME vale o DOBRO (Peso 2)
        // PF vale 1 pra 1 (Peso 1)
        const pontosPME = valorPME * 2;
        const pontosPF = valorPF * 1;
        const totalPontos = pontosPME + pontosPF;

        listaCorretores.push({
            id: id,
            ...dados,
            valorPME,
            valorPF,
            totalPontos // Usaremos isso para ordenar
        });

        // Preenche o Select
        let option = document.createElement('option');
        option.value = id;
        option.text = dados.nome;
        selectCorretor.appendChild(option);
    });

    renderizarRanking();
});

// 2. DESENHAR TABELA
function renderizarRanking() {
    // Ordenar por PONTOS (Do maior para o menor)
    listaCorretores.sort((a, b) => b.totalPontos - a.totalPontos);

    let html = '';
    
    listaCorretores.forEach((c, index) => {
        // Formatador de Moeda para colunas 1 e 2
        const fmtMoney = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        // Formatador de Pontos para coluna 3 (Sem R$, número inteiro)
        const fmtPontos = (v) => Math.floor(v).toLocaleString('pt-BR'); // Ex: 9.000
        
        let medalha = '';
        if (index === 0) medalha = '🥇';
        if (index === 1) medalha = '🥈';
        if (index === 2) medalha = '🥉';

        html += `
            <tr>
                <td>${index + 1}º ${medalha}</td>
                <td class="text-start fw-bold">${c.nome}</td>
                <td class="text-primary">${fmtMoney(c.valorPME)}</td>
                <td class="text-info">${fmtMoney(c.valorPF)}</td>
                <td class="fw-bold fs-5 bg-light text-primary">
                    ${fmtPontos(c.totalPontos)} <small style="font-size:0.6em">PTS</small>
                </td>
            </tr>
        `;
    });
    tabela.innerHTML = html;
}

// 3. SALVAR (Mantém salvando em R$ no banco, o cálculo é visual)
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = selectCorretor.value;
    if(!id) return alert("Selecione um corretor!");

    const valorPME = parseFloat(document.getElementById('valor-pme').value) || 0;
    const valorPF = parseFloat(document.getElementById('valor-pf').value) || 0;

    try {
        const docRef = doc(db, "corretores", id);
        
        await updateDoc(docRef, {
            producao_pme: valorPME,
            producao_pf: valorPF
            // Removemos o campo 'pme_ativo', agora é automático
        });

        alert("Valores atualizados com sucesso!");
        form.reset();
    } catch (error) {
        console.error("Erro:", error);
        alert("Erro ao atualizar.");
    }
});

// 4. PREENCHER INPUTS
selectCorretor.addEventListener('change', (e) => {
    const id = e.target.value;
    const corretor = listaCorretores.find(c => c.id === id);

    if (corretor) {
        document.getElementById('valor-pme').value = corretor.producao_pme;
        document.getElementById('valor-pf').value = corretor.producao_pf;
    }
});

// 5. ZERAR
window.resetarValores = async () => {
    const id = selectCorretor.value;
    if(!id) return alert("Selecione um corretor!");
    if(confirm("Deseja ZERAR a produção?")) {
        await updateDoc(doc(db, "corretores", id), {
            producao_pme: 0,
            producao_pf: 0
        });
        alert("Zerado.");
        form.reset();
    }
};
