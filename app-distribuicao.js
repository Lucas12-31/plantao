import { db } from "./firebase-config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Função principal chamada pelo botão
window.executarLogica = async () => {
    
    // 1. Pegar dados da tela
    let totalPME = parseInt(document.getElementById('leads-pme-total').value) || 0;
    let totalPF = parseInt(document.getElementById('leads-pf-total').value) || 0;
    
    // 2. Pegar corretores do Firebase
    const querySnapshot = await getDocs(collection(db, "corretores"));
    let corretores = [];
    
    querySnapshot.forEach((doc) => {
        corretores.push({ id: doc.id, ...doc.data() });
    });

    // 3. FILTRAR ELEGÍVEIS (Meta R$ 3.000)
    // Quem não bateu a meta, nem entra na conta.
    let elegiveis = corretores.filter(c => c.producao >= 3000);
    
    // Lista final para exibir
    let distribuicao = [];
    
    // --- LÓGICA DE DISTRIBUIÇÃO PME ---
    
    // Primeiro: Calcular direitos por Progressão (PF > 5k, 7k...)
    // Regra: A cada 2k acima de 3k = 1 PME
    elegiveis.forEach(c => {
        let leadsPME = 0;
        let leadsPF = 0;
        let motivo = "";

        // Cálculo do Bônus PME por Produção
        let excedente = c.producao - 3000;
        let bonusPME = 0;
        if (excedente >= 2000) {
            bonusPME = Math.floor(excedente / 2000); // Ex: 5000-3000 = 2000 / 2000 = 1
        }

        // Prioridade PME Ativo (Peso 2 na disputa)
        // Aqui vamos simplificar: Se tem PME Ativo, garante +1 na distribuição ou prioridade
        // Para este código, vamos somar o bônus ao estoque.
        
        // Vamos descontar do total disponível os bônus obrigatórios primeiro?
        // Ou vamos distribuir proporcionalmente?
        // Vou adotar a distribuição direta conforme sua regra de progressão.
        
        if (totalPME >= bonusPME) {
            leadsPME += bonusPME;
            totalPME -= bonusPME;
            if(bonusPME > 0) motivo += `Ganhou ${bonusPME} PME por meta batida. `;
        }
        
        // Se o cara tem PME Ativo, ele entra no rateio do que sobrou com Peso 2
        // Vamos marcar ele para a segunda rodada de distribuição
        c.temp_leadsPME = leadsPME; 
        c.temp_motivo = motivo;
    });

    // Segunda Rodada PME: Rateio do que sobrou para quem tem PME ATIVO
    let corretoresPMEAtivo = elegiveis.filter(c => c.pme_ativo);
    
    if (corretoresPMEAtivo.length > 0 && totalPME > 0) {
        // Distribuição simples do restante para quem tem PME ativo
        // Aqui você pode refinar. Vou dividir igualmente o que sobrou entre eles.
        let extraPorCabeca = Math.floor(totalPME / corretoresPMEAtivo.length);
        
        corretoresPMEAtivo.forEach(c => {
            c.temp_leadsPME += extraPorCabeca;
            c.temp_motivo += `+${extraPorCabeca} PME por Negociação Ativa. `;
        });
        totalPME = totalPME - (extraPorCabeca * corretoresPMEAtivo.length);
    }

    // --- LÓGICA DE DISTRIBUIÇÃO PF ---
    // Regra: "Recebe proporção disponível".
    // Vamos dividir o total de PF igualmente entre todos os elegíveis.
    if (elegiveis.length > 0) {
        let pfPorCabeca = Math.floor(totalPF / elegiveis.length);
        elegiveis.forEach(c => {
            c.temp_leadsPF = pfPorCabeca;
        });
        totalPF = totalPF - (pfPorCabeca * elegiveis.length);
    }

    // --- RENDERIZAR NA TELA ---
    const tbody = document.getElementById('tabela-resultado');
    tbody.innerHTML = '';

    // Mostrar ELEGÍVEIS
    elegiveis.forEach(c => {
        let classeDestaque = c.pme_ativo ? "table-warning" : "";
        let icone = c.pme_ativo ? "⭐" : "";
        
        tbody.innerHTML += `
            <tr class="${classeDestaque}">
                <td>${c.nome} ${icone}</td>
                <td><span class="badge bg-success">Apto</span></td>
                <td>R$ ${c.producao}</td>
                <td><strong>${c.temp_leadsPME}</strong> <small class="text-muted d-block">${c.temp_motivo}</small></td>
                <td><strong>${c.temp_leadsPF}</strong></td>
            </tr>
        `;
    });

    // Mostrar NÃO ELEGÍVEIS (Meta < 3k)
    let naoElegiveis = corretores.filter(c => c.producao < 3000);
    naoElegiveis.forEach(c => {
        tbody.innerHTML += `
            <tr class="table-secondary text-muted">
                <td>${c.nome}</td>
                <td><span class="badge bg-danger">Inapto (Meta)</span></td>
                <td>R$ ${c.producao}</td>
                <td>0</td>
                <td>0</td>
            </tr>
        `;
    });

    // Mostrar SOBRAS (Para a Supervisora)
    const divSobras = document.getElementById('alert-sobras');
    if (totalPME > 0 || totalPF > 0) {
        divSobras.classList.remove('d-none');
        divSobras.innerHTML = `
            <strong>🚨 SOBRAS PARA GESTÃO:</strong><br>
            Leads PME: ${totalPME} <br>
            Leads PF: ${totalPF} <br>
            <em>(Direcionar conforme critério de meritocracia/estratégia)</em>
        `;
    } else {
        divSobras.classList.add('d-none');
    }
};
