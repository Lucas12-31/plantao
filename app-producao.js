import { db } from "./firebase-config.js";
import { collection, onSnapshot, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const selectCorretor = document.getElementById('select-corretor');
const form = document.getElementById('form-producao');
const tabela = document.getElementById('tabela-ranking');

// VARIÁVEL LOCAL PARA GUARDAR DADOS CARREGADOS
let listaCorretores = [];

// 1. CARREGAR DADOS E GERAR RANKING (Tudo em tempo real)
onSnapshot(collection(db, "corretores"), (snapshot) => {
    listaCorretores = [];
    selectCorretor.innerHTML = '<option value="">Selecione um corretor...</option>';
    
    snapshot.forEach(doc => {
        const dados = doc.data();
        const id = doc.id;
        
        // Calcula Total Geral
        const totalPME = parseFloat(dados.producao_pme) || 0;
        const totalPF = parseFloat(dados.producao_pf) || 0;
        const totalGeral = totalPME + totalPF;

        listaCorretores.push({
            id: id,
            ...dados,
            totalPME,
            totalPF,
            totalGeral
        });

        // Preenche o Select (Menu dropdown)
        let option = document.createElement('option');
        option.value = id;
        option.text = dados.nome;
        selectCorretor.appendChild(option);
    });

    renderizarRanking();
});

// 2. FUNÇÃO QUE DESENHA A TABELA (ORDENADA)
function renderizarRanking() {
    // Ordenar: Maior Total Geral primeiro
    listaCorretores.sort((a, b) => b.totalGeral - a.totalGeral);

    let html = '';
    listaCorretores.forEach((c, index) => {
        // Formata moeda (R$)
        const fmt = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        
        // Ícone de Medalha para o Top 3
        let medalha = '';
        if (index === 0) medalha = '🥇';
        if (index === 1) medalha = '🥈';
        if (index === 2) medalha = '🥉';

        // Badge de PME Ativo
        let statusPME = c.pme_ativo 
            ? '<span class="badge bg-success">ATIVO</span>' 
            : '<span class="badge bg-secondary">Inativo</span>';

        html += `
            <tr>
                <td>${index + 1}º ${medalha}</td>
                <td class="text-start fw-bold">${c.nome}</td>
                <td>${statusPME}</td>
                <td class="text-primary">${fmt(c.totalPME)}</td>
                <td class="text-info">${fmt(c.totalPF)}</td>
                <td class="fw-bold fs-5 bg-light">${fmt(c.totalGeral)}</td>
            </tr>
        `;
    });
    tabela.innerHTML = html;
}

// 3. ATUALIZAR PRODUÇÃO (Ao enviar o formulário)
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = selectCorretor.value;
    if(!id) return alert("Selecione um corretor!");

    const valorPME = parseFloat(document.getElementById('valor-pme').value) || 0;
    const valorPF = parseFloat(document.getElementById('valor-pf').value) || 0;
    const pmeAtivo = document.getElementById('check-pme-ativo').checked;

    try {
        const docRef = doc(db, "corretores", id);
        
        // Atualiza apenas os campos de produção
        await updateDoc(docRef, {
            producao_pme: valorPME,
            producao_pf: valorPF,
            pme_ativo: pmeAtivo
        });

        alert("Produção atualizada com sucesso!");
        form.reset();
    } catch (error) {
        console.error("Erro:", error);
        alert("Erro ao atualizar.");
    }
});

// 4. PREENCHER CAMPOS AO SELECIONAR CORRETOR NO MENU
// Isso ajuda a ver quanto ele JÁ TEM antes de atualizar
selectCorretor.addEventListener('change', (e) => {
    const id = e.target.value;
    const corretor = listaCorretores.find(c => c.id === id);

    if (corretor) {
        document.getElementById('valor-pme').value = corretor.producao_pme;
        document.getElementById('valor-pf').value = corretor.producao_pf;
        document.getElementById('check-pme-ativo').checked = corretor.pme_ativo;
    }
});

// 5. FUNÇÃO PARA ZERAR (EXCLUIR VALORES)
window.resetarValores = async () => {
    const id = selectCorretor.value;
    if(!id) return alert("Selecione um corretor para zerar!");

    if(confirm("Tem certeza que deseja ZERAR a produção deste corretor?")) {
        await updateDoc(doc(db, "corretores", id), {
            producao_pme: 0,
            producao_pf: 0,
            pme_ativo: false
        });
        alert("Valores zerados.");
        form.reset();
    }
};
