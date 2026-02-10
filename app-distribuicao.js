import { db } from "./firebase-config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

window.executarLogica = async () => {
    let totalPME = parseInt(document.getElementById('leads-pme-total').value) || 0;
    let totalPF = parseInt(document.getElementById('leads-pf-total').value) || 0;
    
    const querySnapshot = await getDocs(collection(db, "corretores"));
    let corretores = [];
    
    querySnapshot.forEach((doc) => {
        let dados = doc.data();
        let prodPME = parseFloat(dados.producao_pme) || 0;
        let prodPF = parseFloat(dados.producao_pf) || 0;
        
        // CÁLCULO DE PONTOS PARA A DISTRIBUIÇÃO
        // Mantivemos a meta de 3000, mas agora olhando para o "Valor Gerado" (R$)
        // Se preferir que a meta seja 3000 PONTOS, me avise. 
        // Por enquanto, mantive a regra original: Meta R$ 3.000 em dinheiro.
        let totalGeralReais = prodPME + prodPF; 
        
        // Define se é "PME Ativo" automaticamente (se vendeu PME, tem prioridade)
        let isPmeAtivo = prodPME > 0;

        corretores.push({ 
            id: doc.id, 
            ...dados,
            totalGeral: totalGeralReais,
            isPmeAtivo: isPmeAtivo
        });
    });

    // Filtra quem bateu a meta FINANCEIRA de R$ 3.000
    let elegiveis = corretores.filter(c => c.totalGeral >= 3000);
    
    if (elegiveis.length === 0) {
        alert("Ninguém atingiu a meta de R$ 3.000 (Soma PME + PF).");
        renderizarTabela([], corretores);
        return;
    }

    elegiveis.forEach(c => {
        c.temp_leadsPME = 0;
        c.temp_leadsPF = 0;
        c.temp_motivo = "";
    });

    // 1. BÔNUS POR PROGRESSÃO
    elegiveis.forEach(c => {
        let excedente = c.totalGeral - 3000;
        if (excedente >= 2000) {
            let bonusPME = Math.floor(excedente / 2000);
            if (totalPME >= bonusPME) {
                c.temp_leadsPME += bonusPME;
                totalPME -= bonusPME;
                if(bonusPME > 0) c.temp_motivo += `🎯 +${bonusPME} (Meta). `;
            } else if (totalPME > 0) {
                c.temp_leadsPME += totalPME;
                totalPME = 0;
            }
        }
    });

    // 2. PESO 2 / PME ATIVO (Automático: Quem vendeu PME > 0)
    let corretoresPME = elegiveis.filter(c => c.isPmeAtivo);
    
    if (corretoresPME.length > 0 && totalPME > 0) {
        let pmePorCabeca = Math.floor(totalPME / corretoresPME.length);
        if (pmePorCabeca > 0) {
            corretoresPME.forEach(c => {
                c.temp_leadsPME += pmePorCabeca;
                c.temp_motivo += `⭐ +${pmePorCabeca} (Peso 2). `;
            });
            totalPME -= (pmePorCabeca * corretoresPME.length);
        }
    }

    // 3. DISTRIBUIÇÃO PF
    if (elegiveis.length > 0 && totalPF > 0) {
        let pfPorCabeca = Math.floor(totalPF / elegiveis.length);
        if (pfPorCabeca > 0) {
            elegiveis.forEach(c => c.temp_leadsPF += pfPorCabeca);
            totalPF -= (pfPorCabeca * elegiveis.length);
        }
    }

    renderizarTabela(elegiveis, corretores);
    mostrarSobras(totalPME, totalPF);
};

function renderizarTabela(elegiveis, todos) {
    const tbody = document.getElementById('tabela-resultado');
    tbody.innerHTML = '';
    const idsElegiveis = elegiveis.map(c => c.id);

    elegiveis.forEach(c => {
        let destaque = c.isPmeAtivo ? "table-warning" : "table-success";
        let icone = c.isPmeAtivo ? "⭐" : "";
        
        tbody.innerHTML += `
            <tr class="${destaque}">
                <td>${c.nome} ${icone}</td>
                <td><span class="badge bg-success">Apto</span></td>
                <td>R$ ${c.totalGeral.toLocaleString('pt-BR')}</td>
                <td class="fw-bold">${c.temp_leadsPME} <br><small class="text-muted">${c.temp_motivo}</small></td>
                <td class="fw-bold">${c.temp_leadsPF}</td>
            </tr>`;
    });

    todos.forEach(c => {
        if (!idsElegiveis.includes(c.id)) {
            tbody.innerHTML += `
                <tr class="table-light text-muted opacity-75">
                    <td>${c.nome}</td>
                    <td><span class="badge bg-danger">Inapto</span></td>
                    <td>R$ ${c.totalGeral.toLocaleString('pt-BR')}</td>
                    <td>-</td><td>-</td>
                </tr>`;
        }
    });
}

function mostrarSobras(pme, pf) {
    const div = document.getElementById('alert-sobras');
    if (pme > 0 || pf > 0) {
        div.classList.remove('d-none');
        div.innerHTML = `<strong>🚨 SOBRAS:</strong> PME: ${pme} | PF: ${pf}`;
    } else {
        div.classList.add('d-none');
    }
}
