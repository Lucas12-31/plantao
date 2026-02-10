import { db } from "./firebase-config.js";
import { collection, addDoc, getDocs, onSnapshot, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const selectCorretor = document.getElementById('select-corretor');
const form = document.getElementById('form-lead');
const tabela = document.getElementById('tabela-leads');

// 1. Carregar Corretores para o Select
async function carregarCorretores() {
    const snapshot = await getDocs(collection(db, "corretores"));
    let html = '<option value="">Selecione um corretor...</option>';
    
    snapshot.forEach(doc => {
        let d = doc.data();
        html += `<option value="${doc.id}">${d.nome}</option>`;
    });
    selectCorretor.innerHTML = html;
}
carregarCorretores();

// 2. Salvar Lead
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nomeLead = document.getElementById('nome-lead').value;
    const fonte = document.getElementById('fonte-lead').value;
    const tipo = document.getElementById('tipo-lead').value; // 'pme' ou 'pf'
    const dataChegada = document.getElementById('data-chegada').value;
    const dataEntrega = document.getElementById('data-entrega').value; // YYYY-MM-DD
    
    // Pega o ID e o Nome do corretor selecionado (para facilitar exibição)
    const idCorretor = selectCorretor.value;
    const nomeCorretor = selectCorretor.options[selectCorretor.selectedIndex].text;

    try {
        await addDoc(collection(db, "leads"), {
            cliente: nomeLead,
            fonte: fonte,
            tipo: tipo,
            data_chegada: dataChegada,
            data_entrega: dataEntrega,
            corretor_id: idCorretor,
            corretor_nome: nomeCorretor,
            timestamp: new Date()
        });
        
        alert("Lead cadastrado com sucesso!");
        form.reset();
        // Define data de hoje nos campos de data para facilitar
        document.getElementById('data-chegada').valueAsDate = new Date();
        document.getElementById('data-entrega').valueAsDate = new Date();
    } catch (error) {
        console.error(error);
        alert("Erro ao salvar lead.");
    }
});

// 3. Listar Últimos Leads (Tempo Real)
const q = query(collection(db, "leads"), orderBy("timestamp", "desc"), limit(10));
onSnapshot(q, (snapshot) => {
    let html = '';
    snapshot.forEach(doc => {
        let d = doc.data();
        // Formatar data para exibição (DD/MM)
        let dataFormatada = d.data_entrega.split('-').reverse().slice(0,2).join('/');
        
        let badge = d.tipo === 'pme' ? 'bg-warning text-dark' : 'bg-info text-white';

        html += `
            <tr>
                <td>${dataFormatada}</td>
                <td>${d.corretor_nome}</td>
                <td><span class="badge ${badge}">${d.tipo.toUpperCase()}</span></td>
                <td>${d.cliente}</td>
                <td>${d.fonte}</td>
            </tr>
        `;
    });
    tabela.innerHTML = html;
});
