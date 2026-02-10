import { db } from "./firebase-config.js";
import { collection, getDocs, updateDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Variável global para guardar o cálculo antes de salvar
let resultadoParaSalvar = [];

window.executarLogica = async () => {
    let totalPME = parseInt(document.getElementById('leads-pme-total').value) || 0;
    let totalPF = parseInt(document.getElementById('leads-pf-total').value) || 0;
    
    const querySnapshot = await getDocs(collection(db, "corretores"));
    let corretores = [];
    
    querySnapshot.forEach((doc) => {
        let d = doc.data();
        let prodPME = parseFloat(d.producao_pme) || 0;
        let prodPF = parseFloat(d.producao_pf) || 0;
        let totalFinanceiro = prodPME + prodPF; 
        let totalPontos = (prodPME * 2) + prodPF;
        let isPmeAtivo = prodPME > 0;

        corretores.push({ 
            id: doc.id, ...d, 
            totalFinanceiro, totalPontos, isPmeAtivo,
            temp_leadsPME: 0, temp_leadsPF: 0, temp_motivo: ""
        });
    });

    let elegiveis = corretores.filter(c => c.totalFinanceiro >= 3000);
    elegiveis.sort((a, b) => b.totalPontos - a.totalPontos);

    if (elegiveis.length === 0) return alert("Ninguém bateu a meta.");

    // --- LÓGICA DE DISTRIBUIÇÃO (Mantida igual) ---
    // 1. Bônus Progressivo
    elegiveis.forEach(c => {
        let excedente = c.totalFinanceiro - 3000;
        if (excedente >= 2000) {
            let bonus = Math.floor(excedente / 2000);
            if (totalPME >= bonus) {
                c.temp_leadsPME += bonus; totalPME -= bonus;
                if(bonus > 0) c.temp_motivo += `🎯 +${bonus} (Meta). `;
            } else if (totalPME > 0) { c.temp_leadsPME += totalPME; totalPME = 0; }
        }
    });

    // 2. Peso 2 (PME Ativo)
    let pmeGroup = elegiveis.filter(c => c.isPmeAtivo);
    if (pmeGroup.length > 0 && totalPME > 0) {
        let part = Math.floor(totalPME / pmeGroup.length);
        if (part > 0) {
            pmeGroup.forEach(c => { c.temp_leadsPME += part; c.temp_motivo += `⭐ +${part} (Peso 2). `; });
            totalPME -= (part * pmeGroup.length);
        }
    }

    // 3. Proporcional PF
    if (elegiveis.length > 0 && totalPF > 0) {
        let totalPts = elegiveis.reduce((a, b) => a + b.totalPontos, 0);
        let disponivel = totalPF;
        if (totalPts > 0) {
            elegiveis.forEach(c => {
                let share = c.totalPontos / totalPts;
                let qtd = Math.floor(disponivel * share);
                c.temp_leadsPF += qtd; totalPF -= qtd;
            });
        } else {
            let part = Math.floor(totalPF / elegiveis.length);
            elegiveis.forEach(c => { c.temp_leadsPF += part; totalPF -= part; });
        }
    }

    // GUARDA O RESULTADO NA MEMÓRIA GLOBAL
    resultadoParaSalvar = elegiveis;

    // RENDERIZA E MOSTRA O BOTÃO DE SALVAR
    renderizarTabela(elegiveis, corretores);
    document.getElementById('btn-salvar-db').classList.remove('d-none'); // Mostra botão
    mostrarSobras(totalPME, totalPF);
};

// --- NOVA FUNÇÃO: SALVAR NO FIREBASE ---
window.salvarNoBanco = async () => {
    if (resultadoParaSalvar.length === 0) return alert("Rode a distribuição primeiro!");
    
    let btn = document.getElementById('btn-salvar-db');
    btn.innerHTML = "Salvando...";
    btn.disabled = true;

    try {
        // Atualiza um por um
        for (const c of resultadoParaSalvar) {
            const docRef = doc(db, "corretores", c.id);
            await updateDoc(docRef, {
                saldo_pme: c.temp_leadsPME, // Salva o saldo PME
                saldo_pf: c.temp_leadsPF,   // Salva o saldo PF
                leads_entregues_pme: 0,     // Reseta contagem de entregues
                leads_entregues_pf: 0
            });
        }
        alert("✅ Distribuição salva com sucesso! Agora vá para o Plantão.");
        window.location.href = "plantao.html"; // Redireciona
    } catch (error) {
        console.error(error);
        alert("Erro ao salvar.");
        btn.innerHTML = "💾 Confirmar e Salvar Distribuição";
        btn.disabled = false;
    }
};

function renderizarTabela(elegiveis, todos) {
    const tbody = document.getElementById('tabela-resultado');
    tbody.innerHTML = '';
    // ... (Código de renderização da tabela igual ao anterior) ...
    // Vou resumir para caber, use o mesmo renderizarTabela do passo anterior
    const idsElegiveis = elegiveis.map(c => c.id);
    const fmtMoney = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const fmtPontos = v => Math.floor(v).toLocaleString('pt-BR');

    elegiveis.forEach(c => {
        let destaque = c.isPmeAtivo ? "table-warning" : "table-success";
        tbody.innerHTML += `
            <tr class="${destaque}">
                <td>${c.nome} ${c.isPmeAtivo ? "⭐" : ""}</td>
                <td><span class="badge bg-success">Apto</span></td>
                <td>${fmtMoney(c.totalFinanceiro)} <br><small>(${fmtPontos(c.totalPontos)} pts)</small></td>
                <td class="fw-bold fs-5">${c.temp_leadsPME}</td>
                <td class="fw-bold fs-5">${c.temp_leadsPF}</td>
            </tr>`;
    });
}

function mostrarSobras(pme, pf) {
    const div = document.getElementById('alert-sobras');
    if (pme > 0 || pf > 0) {
        div.classList.remove('d-none');
        div.innerHTML = `🚨 <b>SOBRAS:</b> PME: ${pme} | PF: ${pf}`;
    } else {
        div.classList.add('d-none');
    }
}
