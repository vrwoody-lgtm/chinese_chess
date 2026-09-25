#pragma once

#include <cstddef>
#include <cstdint>

extern "C" {

int cc_pikafish_init(const char* nnue_path);
int cc_pikafish_is_ready();
int cc_pikafish_search(const char* fen,
                       std::uint32_t depth,
                       std::uint64_t move_time_ms,
                       std::uint32_t multi_pv,
                       std::uint32_t candidate_rank,
                       char* best_move,
                       std::size_t best_move_capacity);
void cc_pikafish_shutdown();

}
