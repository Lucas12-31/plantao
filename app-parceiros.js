import { db } from "./firebase-config.js";
import { collection, addDoc, onSnapshot, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const form = document.getElementById('form-parceiro');
const lista = document.getElementById('lista-parceiros');

// 1. SALVAR PARCEIRO
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nome = document.getElementById('nome-parceiro').value;
    const qtd = parseInt(document.getElementById('qtd-leads').value);

    try {
        await addDoc(collection(db, "parceiros"), {
            nome: nome,
            leads_comprados: qtd,
            data_cadastro: new Date()
        });
        alert("Parceiro salvo com sucesso!");
        form.reset();
    } catch (error) {
        console.error(error);
        alert("Erro ao salvar.");
    }
});

// 2. LISTAR (Tempo Real)
onSnapshot(collection(db, "parceiros"), (snapshot) => {
    let html = '';
    
    if (snapshot.empty) {
        lista.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Nenhum parceiro cadastrado.</td></tr>';
        return;
    }

    snapshot.forEach(d => {
        let dados = d.data();
        let id = d.id;

        html += `
            <tr>
                <td class="fw-bold">${dados.nome}</td>
                <td><span class="badge bg-primary fs-6">${dados.leads_comprados}</span></td>
                <td>
                    <button onclick="deletar('${id}')" class="btn btn-outline-danger btn-sm">🗑️ Excluir</button>
                </td>
            </tr>
        `;
    });

    lista.innerHTML = html;
});

// 3. EXCLUIR
window.deletar = async (id) => {
    if(confirm("Tem certeza que deseja excluir este parceiro?")) {
        await deleteDoc(doc(db, "parceiros", id));
    }
};
