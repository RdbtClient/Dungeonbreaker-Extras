/// <reference types="../CTAutocomplete" />
/// <reference lib="es2015" />

import { renderBoxFilled } from "../Apelles/index";
import settings from "./settings";
import DungeonScanner from "../tska/skyblock/dungeon/DungeonScanner";
import Location from "../tska/skyblock/Location";
import Dungeon from "../tska/skyblock/dungeon/Dungeon";
import PogObject from "../PogData";
import { nukeBlock, worldToRelative, relativeToWorld, findItemInHotbar, setItemSlot } from "./utils.js";
const offset = 0.01; // idk how to fix zfighting in apelles so fuck it
const Vec3 = Java.type("net.minecraft.util.Vec3");
const BP = Java.type("net.minecraft.util.BlockPos");
const C08PacketPlayerBlockPlacement = Java.type("net.minecraft.network.play.client.C08PacketPlayerBlockPlacement");

/**
 * Main class for DungeonBreakerExtras mod
 */
class DungeonBreakerExtras {
  constructor() {
    this.inDungeon = false;
    this.editMode = false;
    this.timeout = 0;
    this.dungeonbreakerSlot = 0;
    this.warned = false;
    this.roomContext = null;
    this.autoSwapSlot = null;
    this.keySwapSlot = null;
    this.keyNukeActive = false;

    this.minedBlocks = new Map();

    this.roomBlockData = new PogObject("DungeonBreakerExtras", { roomBlocks: {} }, "data/roomBlockData.json");

    register("tick", () => this.handleTick());
    register("renderWorld", () => this.handleRender());

    register("command", (subcommand) => this.handleCommand(subcommand))
      .setName("dbe")
      .setAliases(["dungeonbreakerextras"]);

    register("hitBlock", (block) => {
      this.handleHitBlock(block);
    })

    register("packetSent", (packet) => {
      this.handleC08(packet);
    }).setFilteredClass(C08PacketPlayerBlockPlacement);

    this.keyNukeBind = new KeyBind("Nuker (Hold)", 0, "DungeonBreakerExtras");
  }

  handleTick() {
    this.loadRoomContext();
    if (this.handleKeyNuke()) return;
    this.handleAutoNuke();
  }

  loadRoomContext() {
    const previousContext = this.roomContext;

    this.detectedRoom = Dungeon.inBoss() ? this.getBossRoom() : DungeonScanner.getCurrentRoom();

    if (!this.detectedRoom || !this.detectedRoom.corner) {
      if (++this.timeout > 5) {
        this.clearRoomData(previousContext);
      }
      return;
    }

    this.timeout = 0;

    if (Location.area !== "Catacombs") {
      this.clearRoomData(previousContext, { resetDungeon: true, restoreSlot: false });
      return;
    }

    this.inDungeon = true;

    this.detectedRoom.corner = this.detectedRoom.corner.map(Math.floor);

    const name = this.detectedRoom.name;
    const rotation = this.detectedRoom.rotation ?? 0;
    const corner = [...this.detectedRoom.corner];
    this.roomContext = { name, rotation, corner };

    if (!previousContext || previousContext.name !== name) this.minedBlocks.clear();
    this.worldBlocks = [];

    (this.roomBlockData.roomBlocks[name] || []).forEach((block) => {
      this.worldBlocks.push(relativeToWorld(block, this.roomContext));
    });
  }

  handleAutoNuke() {
    const safeRestore = (force = false) => {
      if (this.keyNukeActive) return true;
      return this.restoreAutoSlot(force);
    };

    if (!settings.enabledNuker || !this.detectedRoom || !this.inDungeon || this.editMode) return safeRestore();
    if (Client.isInGui() && !Client.isInChat()) return safeRestore();
    if (!this.worldBlocks?.length) return safeRestore();
    if (!settings.autoSwap && !this.isHoldingDungeonbreaker()) return safeRestore(true);

    this.dungeonbreakerSlot = findItemInHotbar("Dungeonbreaker");
    if (this.dungeonbreakerSlot === -1) {
      if (!this.warned) ChatLib.chat("&eDungeonbreakerextras Could not find dungeonbreaker in hotbar!");
      this.warned = true;
      return safeRestore(true);
    }
    this.warned = false;

    this.pruneMinedBlocks();

    const block = this.getClosestBlock();
    if (!block) return safeRestore();

    if (!this.isHoldingDungeonbreaker()) {
      if (settings.autoSwap) {
        this.autoSwapSlot = Player.getHeldItemIndex();
        setItemSlot(this.dungeonbreakerSlot);
      }
      return true;
    }

    this.minedBlocks.set(block.join(","), Date.now());
    nukeBlock(block);
    return true;
  }

  handleKeyNuke() {
    if (!this.keyNukeBind.isKeyDown()) {
      if (!this.keyNukeActive) return false;
      this.keyNukeActive = false;
      if (this.restoreKeySlot()) return true;
      return this.restoreAutoSlot(true);
    }

    if (!this.keyNukeActive) {
      this.keySwapSlot = Player.getHeldItemIndex();
      this.keyNukeActive = true;
    }

    if (Client.isInGui() && !Client.isInChat()) return false;
    if (!this.isHoldingDungeonbreaker()) {
      if (settings.autoSwap) {
        this.autoSwapSlot = Player.getHeldItemIndex();
        setItemSlot(this.dungeonbreakerSlot);
      }
      return true;
    }

    const target = Player.lookingAt();
    if (!target || typeof target.getX !== "function") return false;

    const x = target.getX();
    const y = target.getY();
    const z = target.getZ();
    const block = World.getBlockAt(x, y, z);
    if (!block || block.type?.getID() === 0) return false;

    const coords = [x, y, z];
    if (!this.isWithinReach(coords)) return false;

    nukeBlock(coords);
    return true;
  }

  handleRender() {
    if (this.worldBlocks && this.worldBlocks.length > 0) {
      const colorRGBA = [settings.color.getRed() / 255, settings.color.getGreen() / 255, settings.color.getBlue() / 255, settings.color.getAlpha() / 255];
      const size = 1 + offset * 2;
      this.worldBlocks.forEach((block) => {
        renderBoxFilled(colorRGBA, block[0] - offset, block[1] - offset, block[2] - offset, size, size, { centered: false, phase: false });
      });
    }
  }

  handleHitBlock(block) {
    if (!this.inDungeon || !this.isHoldingDungeonbreaker()) return;
    const x = block.getX()
    const y = block.getY()
    const z = block.getZ() 
    if (this.editMode) {
      this.addBlockAtPosition([x, y, z]);
      return;
    }
    if (settings.globalPingless) {
      World.getWorld().func_175698_g(new BP(x, y, z)); // setBlockToAir
    }
  }

  handleC08(packet) {
    if (!this.editMode || !this.inDungeon) return;
    const pos = packet.func_179724_a(); // getPosition
    const x = pos.func_177958_n(); // getX
    const y = pos.func_177956_o(); // getY
    const z = pos.func_177952_p(); // getZ
    if (x === -1 && y === -1 && z === -1) return;
    this.removeBlockAtPosition([x, y, z]);
  }

  handleCommand(subcommand = "help") {
    const command = subcommand.toLowerCase();
    const actions = {
      settings: () => settings.openGUI(),
      edit: () => this.toggleEdit(),
      debug: () => this.debugDump(),
      clearblocks: () => this.clearBlocks(),
      listblocks: () => this.listBlocks(),
      help: () => this.showHelp(),
    };

    (actions[command] || actions.help)();
  }

  showHelp() {
    ChatLib.chat(`&aDungeonBreakerExtras Commands:`);
    ChatLib.chat(`&b/dbe settings &7- Opens the settings GUI.`);
    ChatLib.chat(`&b/dbe edit &7- Toggles edit mode.`);
    ChatLib.chat(`&b/dbe debug &7- Displays debug information.`);
    ChatLib.chat(`&b/dbe listblocks &7- Lists all blocks for the current room.`);
    ChatLib.chat(`&b/dbe clearblocks &7- Clears all blocks for the current room.`);
    ChatLib.chat(`&b/dbe help &7- Displays this help message.`);
  }

  debugDump() {
    ChatLib.chat(`&aDungeonBreakerExtras Debug Dump:`);
    ChatLib.chat(`&b  inDungeon: &7${this.inDungeon}`);
    ChatLib.chat(`&b  editMode: &7${this.editMode}`);
    ChatLib.chat(`&b  detectedRoom: &7${this.roomContext ? "Name: " + this.roomContext.name + ", Corner: [" + this.roomContext.corner.join(", ") + "], Rotation: " + this.roomContext.rotation : "null"}`);
    ChatLib.chat(`&b  worldBlocks count: &7${this.worldBlocks ? this.worldBlocks.length : 0}`);
    ChatLib.chat(`&b  minedBlocks count: &7${this.minedBlocks.size}`);
  }

  toggleEdit() {
    this.editMode = !this.editMode;
    this.roomBlockData.save();
    ChatLib.chat(this.editMode ? `&aEdit mode enabled. Left click to add blocks, right click to remove.` : `&cEdit mode disabled.`);
  }

  clearBlocks() {
    if (!this.inDungeon) return ChatLib.chat(`&cCannot clear blocks: Not in a dungeon.`);
    if (!this.roomContext || !this.roomContext.name) return ChatLib.chat(`&cCannot clear blocks: No current room detected.`);
    if (!this.roomBlockData.roomBlocks[this.roomContext.name]) {
      ChatLib.chat(`&cRoom ${this.roomContext.name} not found in data.`);
      return;
    }
    delete this.roomBlockData.roomBlocks[this.roomContext.name];
    ChatLib.chat(`&aCleared all blocks for room ${this.roomContext.name}.`);
    this.roomBlockData.save();
  }

  listBlocks() {
    if (!this.inDungeon) return ChatLib.chat(`&cCannot list blocks: Not in a dungeon.`);
    if (!this.roomContext || !this.roomContext.name) return ChatLib.chat(`&cCannot list blocks: No current room detected.`);
    const blocks = this.roomBlockData.roomBlocks[this.roomContext.name] || []
    if (!blocks.length) {
      ChatLib.chat(`&eNo blocks stored for room ${this.roomContext.name}.`);
      return;
    }
    ChatLib.chat(`&aBlocks for room ${this.roomContext.name}:`);
    blocks.forEach((block) => {
      ChatLib.chat(`&b- [${block.join(", ")}]`);
    });
  }

  getBossRoom() {
    const floorMatch = Location.subarea?.match(/\(F(\d+)\)/);
    if (!floorMatch) return null;
    return {
      name: `F${floorMatch[1]}`,
      rotation: 0,
      corner: [0, 0, 0],
    };
  }

  clearRoomData(previousContext, { resetDungeon = false, restoreSlot = true } = {}) {
    this.detectedRoom = null;
    this.roomContext = null;
    this.worldBlocks = [];
    if (restoreSlot) {
      this.restoreKeySlot();
      this.restoreAutoSlot(true);
    }
    if (previousContext) this.minedBlocks.clear();
    if (resetDungeon) this.inDungeon = false;
  }

  pruneMinedBlocks() {
    const now = Date.now();
    for (const [pos, time] of this.minedBlocks) {
      if (now - time > 2500) {
        this.minedBlocks.delete(pos);
      }
    }
  }

  getClosestBlock() {
    if (!this.worldBlocks?.length) return null;

    let closest = null;
    let bestDistance = Infinity;

    for (const block of this.worldBlocks) {
      if (!block || block.length < 3) continue;
      const coords = block.map((value) => Number(value));

      const key = coords.join(",");
      if (this.minedBlocks.has(key)) continue;

      const blockState = World.getBlockAt(coords[0], coords[1], coords[2]);
      if (!blockState || blockState.type?.getID() === 0) continue;

      const distance = this.distanceToBlock(coords, 1);
      if (distance > 5 || distance >= bestDistance) continue;

      closest = coords;
      bestDistance = distance;
    }

    return closest;
  }

  distanceToBlock(block, ticks = 1) {
    if (!Array.isArray(block) || block.length < 3) return Infinity;
    const [x, y, z] = block;
    const eyePos = Player.asPlayerMP().getEyePosition(ticks);
    return eyePos.func_72438_d(new Vec3(x + 0.5, y + 0.5, z + 0.5));
  }

  isWithinReach(block, maxDistance = 5, ticks = 1) {
    return this.distanceToBlock(block, ticks) <= maxDistance;
  }

  isHoldingDungeonbreaker() {
    return Player.getHeldItem()?.getName()?.includes("Dungeonbreaker");
  }

  restoreAutoSlot(force = false) {
    if (this.autoSwapSlot === null) return false;
    if (!force && !settings.autoSwapBack) return false;
    setItemSlot(this.autoSwapSlot)
    this.autoSwapSlot = null;
    return true;
  }

  restoreKeySlot() {
    if (this.keySwapSlot === null) return false;
    setItemSlot(this.keySwapSlot);
    this.keySwapSlot = null;
    return true;
  }

  addBlockAtPosition(worldPos) {
    if (!this.editMode) return ChatLib.chat(`&cCannot add block: Edit mode is not enabled.`);
    if (!this.inDungeon) return ChatLib.chat(`&cCannot add block: Not in a dungeon.`);
    if (!this.roomContext || !this.roomContext.name) return ChatLib.chat(`&cCannot add block: No current room detected.`);
    const relativeCoords = worldToRelative(worldPos, this.roomContext);
    if (!relativeCoords) {
      ChatLib.chat(`&cFailed to calculate relative coordinates for clicked block.`);
      return;
    }
    const blockCoords = relativeCoords.map(Math.floor);
    if (!this.roomBlockData.roomBlocks[this.roomContext.name]) {
      this.roomBlockData.roomBlocks[this.roomContext.name] = [];
    }
    const blockList = this.roomBlockData.roomBlocks[this.roomContext.name];
    const exists = blockList.some((block) => block[0] === blockCoords[0] && block[1] === blockCoords[1] && block[2] === blockCoords[2]);
    if (!exists) {
      blockList.push(blockCoords);
      this.roomBlockData.save();
      ChatLib.chat(`&aAdded block [${blockCoords.join(", ")}] to room ${this.roomContext.name}`);
    } else {
      ChatLib.chat(`&eBlock already marked at [${blockCoords.join(", ")}]`);
    }
  }

  removeBlockAtPosition(worldPos) {
    if (!this.editMode) return ChatLib.chat(`&cCannot remove block: Edit mode is not enabled.`);
    if (!this.inDungeon) return ChatLib.chat(`&cCannot remove block: Not in a dungeon.`);
    if (!this.roomContext || !this.roomContext.name) return ChatLib.chat(`&cCannot remove block: No current room detected.`);
    const relativeCoords = worldToRelative(worldPos, this.roomContext);
    if (!relativeCoords) {
      ChatLib.chat(`&cFailed to calculate relative coordinates for clicked block.`);
      return;
    }
    if (!this.roomBlockData.roomBlocks[this.roomContext.name]) return;
    const blockCoords = relativeCoords.map(Math.floor);
    const blockList = this.roomBlockData.roomBlocks[this.roomContext.name];
    const initialLength = blockList.length;
    this.roomBlockData.roomBlocks[this.roomContext.name] = blockList.filter((block) => !(block[0] === blockCoords[0] && block[1] === blockCoords[1] && block[2] === blockCoords[2]));
    if (this.roomBlockData.roomBlocks[this.roomContext.name].length < initialLength) {
      ChatLib.chat(`&cRemoved block [${blockCoords.join(", ")}] from room ${this.roomContext.name}`);
      this.roomBlockData.save();
    } else {
      ChatLib.chat(`&eNo block found at [${blockCoords.join(", ")}]`);
    }
  }
}

new DungeonBreakerExtras();
