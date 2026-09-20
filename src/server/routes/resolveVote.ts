async function routeResolveVote(context:RoomRouteContext) {
  let {body, action, ip, now, started, code, room, players, me, host, authenticatedSpectator}=context;
  {
      if (!host) return out({ error: "UNAUTHORIZED" }, 403);
      if (!["nomination", "vote", "verdict"].includes(room.phase)) return out({ error: "INVALID_ACTION" }, 409);
      const alive = players.filter((x) => x.alive);
      const requiredVoters = room.phase === "verdict" ? alive.filter((x) => x.id !== room.accused_player) : alive;
      if (!requiredVoters.every((x) => x.vote_target) && !phaseExpired(room)) return out({ error: "WAITING_VOTES" }, 409);
      // Missing votes abstain. Never invent a guilty vote on behalf of a player.
      for (const voter of requiredVoters) if (!voter.vote_target) voter.vote_target = "SKIP";
      await snapshot(room, players, "before_vote_result");
      const totals: Record<string, number> = {};
      let abstained = 0;
      for (const voter of requiredVoters) {
        if (voter.vote_target === "SKIP") abstained++;
        else totals[voter.vote_target] = (totals[voter.vote_target] || 0) + 1;
      }
      const voteSummary = { round: room.round, phase: room.phase, abstained,
        counts: Object.entries(totals).map(([id, count]) => ({ name: room.phase === "verdict" ? id : players.find(p => p.id === id)?.name || "", count })).sort((a,b) => b.count-a.count) };
      room.enabled_roles = { ...room.enabled_roles, vote_summary: voteSummary };
      const { error: summaryError } = await db.from("mafia_rooms").update({ enabled_roles: room.enabled_roles }).eq("code",code);
      if (summaryError) throw summaryError;
      if (room.phase === "nomination") {
        const nominationCounts: Record<string, number> = {};
        alive.forEach((x) => nominationCounts[x.vote_target] = (nominationCounts[x.vote_target] || 0) + 1);
        const max = Math.max(...Object.values(nominationCounts));
        const top = Object.keys(nominationCounts).filter((id) => nominationCounts[id] === max);
        if (top.length !== 1 || top[0] === "SKIP") {
          await persist(db.from("mafia_players").update({ vote_target: null, action_target: null }).eq("room_code", code));
          await persist(db.from("mafia_rooms").update({ phase: "night", round: room.round + 1, accused_player: null, last_event: "nomination_tie" }).eq("code", code));
          ({ room, players } = await load(code));
          await botNightActions(room, players);
          ({ room, players } = await load(code));
          return out({ ...publicView(room, players, undefined, true), tie: true });
        }
        await persist(db.from("mafia_players").update({ vote_target: null }).eq("room_code", code));
        await persist(db.from("mafia_rooms").update({ phase: "trial", accused_player: top[0], last_event: "player_accused" }).eq("code", code));
        ({ room, players } = await load(code));
        return out(publicView(room, players, undefined, true));
      }
      if (room.phase === "verdict") {
        const jurors = alive.filter((x) => x.id !== room.accused_player);
        if (!jurors.every((x) => x.vote_target)) return out({ error: "WAITING_VOTES" }, 409);
        const guilty = jurors.filter((x) => x.vote_target === "GUILTY").length;
        const innocent = jurors.filter((x) => x.vote_target === "INNOCENT").length;
        const accused = players.find((x) => x.id === room.accused_player && x.alive);
        const lawyerTarget = players.find((x) => x.alive && x.role === "lawyer")?.action_target;
        let eliminated: string | null = guilty > innocent && accused ? accused.id : null;
        let event = eliminated ? "trial_guilty" : "trial_innocent";
        if (eliminated === lawyerTarget) { eliminated = null; event = "lawyer_saved"; }
        const voteDeaths: string[] = eliminated ? [eliminated] : [];
        const linkedPlayers: string[] = Array.isArray(room.linked_players) ? room.linked_players : [];
        if (eliminated && linkedPlayers.includes(eliminated)) {
          const partner = linkedPlayers.find((id) => id !== eliminated && players.some((x) => x.id === id && x.alive));
          if (partner) { voteDeaths.push(partner); event += ",lovers_died"; }
        }
        const voteCauses = Object.fromEntries(voteDeaths.map((id) => [id, id === eliminated ? (room.phase === "verdict" ? "trial_guilty" : "vote_eliminated") : "lovers_died"]));
      await eliminatePlayers(room, players, voteCauses);
      await prepareLastShot(code, voteCauses, "night", room.round + 1);
        await persist(db.from("mafia_players").update({ vote_target: null, action_target: null }).eq("room_code", code));
        const jesterWinner = eliminated ? players.find((x) => x.id === eliminated)?.role === "jester" : false;
        await persist(db.from("mafia_rooms").update({ phase: jesterWinner ? "finished" : "verdict", winner: jesterWinner ? "jester" : room.winner, winner_player: jesterWinner ? eliminated : room.winner_player, accused_player: null, last_event: jesterWinner ? "jester_won" : event, last_deaths: voteDeaths, last_eliminated: eliminated, last_saved: event === "lawyer_saved", jailed_player: eliminated === room.jailed_player ? null : room.jailed_player }).eq("code", code));
        let winner: string | null = jesterWinner ? "jester" : null;
        if (jesterWinner) { ({ room, players } = await load(code)); await recordStats(room, players); }
        if (!winner) { await promoteMafia(code); winner = await checkWin(code); }
        if (!winner && !(await load(code)).room.enabled_roles?.pending_shot) await db.from("mafia_rooms").update({ phase: "night", round: room.round + 1 }).eq("code", code);
        ({ room, players } = await load(code));
        if (!winner && !room.enabled_roles?.pending_shot) { await botNightActions(room, players); ({ room, players } = await load(code)); }
        return out(publicView(room, players, undefined, true));
      }
      if (room.phase !== "vote") return out({ error: "INVALID_ACTION" }, 400);
      const counts: Record<string, number> = {};
      alive.forEach((x) => counts[x.vote_target] = (counts[x.vote_target] || 0) + 1);
      const max = Math.max(...Object.values(counts)), top = Object.keys(counts).filter((id) => counts[id] === max);
      const lawyerTarget = players.find((x) => x.alive && x.role === "lawyer")?.action_target;
      let eliminated: string | null = null, event = "vote_tie";
      if (top.length === 1 && top[0] !== "SKIP") {
        if (top[0] === lawyerTarget) event = "lawyer_saved";
        else { eliminated = top[0]; event = "vote_eliminated"; }
      }
      const voteDeaths: string[] = eliminated ? [eliminated] : [];
      const linkedPlayers: string[] = Array.isArray(room.linked_players) ? room.linked_players : [];
      if (eliminated && linkedPlayers.includes(eliminated)) {
        const partner = linkedPlayers.find((id) => id !== eliminated && players.some((x) => x.id === id && x.alive));
        if (partner) { voteDeaths.push(partner); event += ",lovers_died"; }
      }
      const voteCauses = Object.fromEntries(voteDeaths.map((id) => [id, id === eliminated ? (room.phase === "verdict" ? "trial_guilty" : "vote_eliminated") : "lovers_died"]));
      await eliminatePlayers(room, players, voteCauses);
      await prepareLastShot(code, voteCauses, "night", room.round + 1);
      await persist(db.from("mafia_players").update({ vote_target: null, action_target: null }).eq("room_code", code));
      const jesterWinner = eliminated ? players.find((x) => x.id === eliminated)?.role === "jester" : false;
      await persist(db.from("mafia_rooms").update({ phase: jesterWinner ? "finished" : room.phase, winner: jesterWinner ? "jester" : room.winner, winner_player: jesterWinner ? eliminated : room.winner_player, last_event: jesterWinner ? "jester_won" : event, last_deaths: voteDeaths, last_eliminated: eliminated, last_saved: event === "lawyer_saved", jailed_player: eliminated === room.jailed_player ? null : room.jailed_player }).eq("code", code));
      let winner: string | null = jesterWinner ? "jester" : null;
      if (jesterWinner) { ({ room, players } = await load(code)); await recordStats(room, players); }
      if (!winner) { await promoteMafia(code); winner = await checkWin(code); }
      if (!winner && !(await load(code)).room.enabled_roles?.pending_shot) await db.from("mafia_rooms").update({ phase: "night", round: room.round + 1 }).eq("code", code);
      ({ room, players } = await load(code));
      if (!winner && !room.enabled_roles?.pending_shot) { await botNightActions(room, players); ({ room, players } = await load(code)); }
      return out({ ...publicView(room, players, undefined, true), tie: top.length > 1 });
    
  }
}
