import { db } from "./firebase-config.js";
import { collection, addDoc, getDocs, onSnapshot, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const selectCorretor = document.getElementById('select-corretor');
const selectFonte = document.getElementById('fonte-lead');
const form = document.getElementById('form-lead');
const tabela = document.getElementById('tabela-leads');

// 1. CARREGAR CORRETORES (Para o Select)
async function carregarCorretores() {
    const snapshot = await getDocs(collection(db, "corretores"));
    let html = '<option value="">Selecione um corretor...</option>';
    
    snapshot.forEach(doc => {
        let d = doc.data();
        html += `<option value="${doc.id}">${d.nome}</option>`;
    });
    selectCorretor.innerHTML = html;
}

// 2. CARREGAR PARCEIROS/FONTES (NOVO!)
// Busca lá da página de Parceiros para preencher o select "Fonte"
async function carregarParceiros() {
    // Usamos onSnapshot para se você cadastrar um parceiro novo, aparecer aqui na hora
    onSnapshot(collection(db, "parceiros"), (snapshot) => {
        let html = '<option value="">Selecione a fonte...</option>';
        
        if (snapshot.empty) {
            html += '<option value="Outros">Nenhum parceiro cadastrado</option>';
        } else {
            snapshot.forEach(doc => {
                let d = doc.data();
                html += `<option value="${d.nome}">${d.nome}</option>`;
            });
            // Opção extra caso seja algo manual
            html += '<option value="Outros">Outros / Manual</option>';
        }
        selectFonte.innerHTML = html;
    });
}

// Inicializa os selects
carregarCorretores();
carregarParceiros();

// 3. SALVAR LEAD
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nomeLead = document.getElementById('nome-lead').value;
    const telefone = document.getElementById('telefone-lead').value; // Novo campo
    const fonte = document.getElementById('fonte-lead').value;
    const tipo = document.getElementById('tipo-lead').value; 
    const dataChegada = document.getElementById('data-chegada').value;
    const dataEntrega = document.getElementById('data-entrega').value;
    
    const idCorretor = selectCorretor.value;
    const nomeCorretor = selectCorretor.options[selectCorretor.selectedIndex].text;

    try {
        await addDoc(collection(db, "leads"), {
            cliente: nomeLead,
            telefone: telefone, // Salvando no banco
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
        
        // Mantém datas de hoje para facilitar
        document.getElementById('data-chegada').valueAsDate = new Date();
        document.getElementById('data-entrega').valueAsDate = new Date();
    } catch (error) {
        console.error(error);
        alert("Erro ao salvar lead.");
    }
});

// 4. LISTAR ÚLTIMOS LEADS
const q = query(collection(db, "leads"), orderBy("timestamp", "desc"), limit(10));

onSnapshot(q, (snapshot) => {
    let html = '';
    snapshot.forEach(doc => {
        let d = doc.data();
        let dataFormatada = d.data_entrega.split('-').reverse().slice(0,2).join('/');
        let badge = d.tipo === 'pme' ? 'bg-warning text-dark' : 'bg-info text-white';

        html += `
            <tr>
                <td>${dataFormatada}</td>
                <td>${d.corretor_nome}</td>
                <td><span class="badge ${badge}">${d.tipo.toUpperCase()}</span></td>
                <td>
                    <div class="fw-bold">${d.cliente}</div>
                    <div class="text-muted small">📞 ${d.telefone || 'Sem nº'}</div>
                </td>
                <td>${d.fonte}</td>
            </tr>
        `;
    });
    tabela.innerHTML = html;
});
