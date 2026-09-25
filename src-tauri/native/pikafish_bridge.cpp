#include "pikafish_bridge.h"

#include <algorithm>
#include <chrono>
#include <condition_variable>
#include <cstring>
#include <fstream>
#include <map>
#include <memory>
#include <mutex>
#include <sstream>
#include <string>
#include <string_view>
#include <vector>

#include "bitboard.h"
#include "engine.h"
#include "position.h"
#include "search.h"
#include "tune.h"
#include "ucioption.h"

namespace {

using Stockfish::Engine;

std::once_flag tables_once;
std::mutex engine_mutex;
std::unique_ptr<Engine> engine_instance;

std::mutex result_mutex;
std::condition_variable result_cv;
bool search_finished = false;
std::string last_best_move;
std::map<std::uint32_t, std::string> latest_multipv_moves;

void initialize_tables() {
    Stockfish::Bitboards::init();
    Stockfish::Position::init();
}

void set_integer_option(Stockfish::OptionsMap& options, const char* name, int value) {
    std::istringstream command(std::string("name ") + name + " value " + std::to_string(value));
    options.setoption(command);
}

std::string first_move(std::string_view pv) {
    const auto first_space = pv.find(' ');
    const auto move = pv.substr(0, first_space);
    return std::string(move);
}

void reset_search_result() {
    std::lock_guard<std::mutex> lock(result_mutex);
    search_finished = false;
    last_best_move.clear();
    latest_multipv_moves.clear();
}

}  // namespace

extern "C" int cc_pikafish_init(const char* nnue_path) {
    if (nnue_path == nullptr || *nnue_path == '\0')
        return -1;

    std::lock_guard<std::mutex> engine_lock(engine_mutex);
    if (engine_instance)
        return 0;

    std::ifstream network_file(nnue_path, std::ios::binary);
    if (!network_file.good())
        return -2;

    std::call_once(tables_once, initialize_tables);

    auto instance = std::make_unique<Engine>(std::string(nnue_path));
    instance->set_on_update_no_moves([](const auto&) {});
    instance->set_on_update_full([](const Engine::InfoFull& info) {
        const auto move = first_move(info.pv);
        if (move.empty())
            return;

        std::lock_guard<std::mutex> lock(result_mutex);
        latest_multipv_moves[static_cast<std::uint32_t>(info.multiPV)] = move;
    });
    instance->set_on_iter([](const auto&) {});
    instance->set_on_verify_networks([](std::string_view) {});
    instance->set_on_bestmove([](std::string_view best_move, std::string_view) {
        std::lock_guard<std::mutex> lock(result_mutex);
        last_best_move.assign(best_move.data(), best_move.size());
        search_finished = true;
        result_cv.notify_all();
    });

    Stockfish::Tune::init(instance->get_options());
    set_integer_option(instance->get_options(), "Threads", 1);
    set_integer_option(instance->get_options(), "Hash", 16);

    std::istringstream eval_file_option(std::string("name EvalFile value ") + nnue_path);
    instance->get_options().setoption(eval_file_option);

    engine_instance = std::move(instance);
    return 0;
}

extern "C" int cc_pikafish_is_ready() {
    std::lock_guard<std::mutex> lock(engine_mutex);
    return engine_instance ? 1 : 0;
}

extern "C" int cc_pikafish_search(const char* fen,
                                   std::uint32_t depth,
                                   std::uint64_t move_time_ms,
                                   std::uint32_t multi_pv,
                                   std::uint32_t candidate_rank,
                                   char* best_move,
                                   std::size_t best_move_capacity) {
    if (fen == nullptr || best_move == nullptr || best_move_capacity == 0)
        return -1;

    std::lock_guard<std::mutex> engine_lock(engine_mutex);
    if (!engine_instance)
        return -2;

    engine_instance->stop();
    engine_instance->wait_for_search_finished();

    engine_instance->set_position(fen, {});

    multi_pv = std::clamp<std::uint32_t>(multi_pv, 1, 12);
    candidate_rank = std::clamp<std::uint32_t>(candidate_rank, 1, multi_pv);

    set_integer_option(engine_instance->get_options(), "MultiPV", static_cast<int>(multi_pv));
    reset_search_result();

    Stockfish::Search::LimitsType limits;
    limits.startTime = Stockfish::now();
    limits.depth = static_cast<int>(std::clamp<std::uint32_t>(depth, 1, 24));
    limits.movetime = static_cast<Stockfish::TimePoint>(std::clamp<std::uint64_t>(
      move_time_ms, 200, 15'000));
    engine_instance->go(limits);

    const auto wait_time = std::chrono::milliseconds(
      static_cast<long long>(std::min<std::uint64_t>(move_time_ms, 15'000) + 4'000));
    {
        std::unique_lock<std::mutex> result_lock(result_mutex);
        if (!result_cv.wait_for(result_lock, wait_time, [] { return search_finished; }))
        {
            engine_instance->stop();
            engine_instance->wait_for_search_finished();
            return -4;
        }
    }

    engine_instance->wait_for_search_finished();

    std::string selected_move;
    {
        std::lock_guard<std::mutex> result_lock(result_mutex);
        const auto candidate = latest_multipv_moves.find(candidate_rank);
        if (candidate != latest_multipv_moves.end())
            selected_move = candidate->second;

        if (selected_move.empty())
        {
            const auto best = latest_multipv_moves.find(1);
            if (best != latest_multipv_moves.end())
                selected_move = best->second;
        }

        if (selected_move.empty())
            selected_move = last_best_move;
    }

    if (selected_move.empty() || selected_move.size() + 1 > best_move_capacity)
        return -5;

    std::memcpy(best_move, selected_move.data(), selected_move.size());
    best_move[selected_move.size()] = '\0';
    return 0;
}

extern "C" void cc_pikafish_shutdown() {
    std::lock_guard<std::mutex> engine_lock(engine_mutex);
    if (!engine_instance)
        return;

    engine_instance->stop();
    engine_instance->wait_for_search_finished();
    engine_instance.reset();
}
