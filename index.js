/// <reference types="../CTAutocomplete" />
/// <reference lib="es2015" />

import { renderBoxFilled } from "../Apelles/index";
import Settings from "./settings";
import DungeonScanner from "../tska/skyblock/dungeon/DungeonScanner";
import Location from "../tska/skyblock/Location";
import Dungeon from "../tska/skyblock/dungeon/Dungeon";
import PogObject from "../PogData";
import settings from "./settings";
import { nukeBlock, worldToRelative, relativeToWorld, findItemInHotbar, setItemSlot } from "./utils.js";
const offset = 0.01; // idk how to fix zfighting in apelles so fuck it
const Vec3 = Java.type("net.minecraft.util.Vec3");
const BP = Java.type("net.minecraft.util.BlockPos");
const C07PacketPlayerDigging = Java.type("net.minecraft.network.play.client.C07PacketPlayerDigging");
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
    this.warned = false

    this.minedBlocks = new Map();

    this.roomBlockData = new PogObject("DungeonBreakerExtras", { roomBlocks: {} }, "data/roomBlockData.json");

    register("tick", () => this.handleRoomTick());
    register("tick", () => this.handleNukerTick());
    register("renderWorld", () => this.handleRender());

    register("command", (subcommand, ...args) => this.handleCommand(subcommand, args))
      .setName("dbe")
      .setAliases(["dungeonbreakerextras"]);

    register("packetSent", (packet) => {
      this.handleC07(packet);
    }).setFilteredClass(C07PacketPlayerDigging);

    register("packetSent", (packet) => {
      this.handleC08(packet);
    }).setFilteredClass(C08PacketPlayerBlockPlacement);
  }

  handleRoomTick() {
    if (Dungeon.inBoss()) {
      const floorMatch = Location.subarea?.match(/\(F(\d+)\)/);
      if (floorMatch) {
        this.detectedRoom = {
          name: `F${floorMatch[1]}`,
          rotation: 0,
          corner: [0, 0, 0],
        };
      }
    } else {
      this.detectedRoom = DungeonScanner.getCurrentRoom();
    }

    // Timeout is incase detection fails somehow
    if (!this.detectedRoom || !this.detectedRoom.corner) {
      this.timeout++;
      if (this.timeout > 5) {
        this.detectedRoom = null;
        this.worldBlocks = [];
      }
      return;
    }
    this.timeout = 0;

    if (Location.area !== "Catacombs") return (this.inDungeon = false);
    this.inDungeon = true;

    this.detectedRoom.corner = this.detectedRoom.corner.map(Math.floor);
    this.worldBlocks = [];
    if (this.roomBlockData.roomBlocks[this.detectedRoom.name]) {
      this.roomBlockData.roomBlocks[this.detectedRoom.name].forEach((block) => {
        const worldCoords = relativeToWorld(block, this.detectedRoom);
        if (!worldCoords) return;
        this.worldBlocks.push(worldCoords);
      });
    }
  }

  handleNukerTick() {
    if (!settings.enabledNuker || !this.detectedRoom || !this.inDungeon || this.editMode) return;
    if (Client.isInGui() && !Client.isInChat()) return;
    if (!this.worldBlocks) return;
    if (!settings.autoSwap && !Player.getHeldItem()?.getName()?.includes("Dungeonbreaker")) return;

    this.dungeonbreakerSlot = findItemInHotbar("Dungeonbreaker");
    if (this.dungeonbreakerSlot === -1) {
      if (!this.warned) ChatLib.chat("&eDungeonbreakerextras Could not find dungeonbreaker in hotbar!");
      this.warned = true
      return;
    } 
    this.warned = false

    for (const [pos, time] of this.minedBlocks) {
      if (Date.now() - time > 1000) {
        this.minedBlocks.delete(pos);
      }
    }

    let block = null;
    let cost = 0;
    this.worldBlocks.forEach((blockCoords) => {
      if (this.minedBlocks.has(blockCoords.join(","))) return;
      if (World.getBlockAt(blockCoords[0], blockCoords[1], blockCoords[2]).type.getID() === 0) return;
      let distance = Player.asPlayerMP()
        .getEyePosition(1)
        .func_72438_d(new Vec3(blockCoords[0] + 0.5, blockCoords[1] + 0.5, blockCoords[2] + 0.5));
      if (distance > 5) return; // this should be 3d distance but thats alot of work, current solution has a max inaccuracy of -0.366 (sqrt(3) / 2)
      if (!block || distance < cost) {
        block = blockCoords;
        cost = distance;
      }
    });
    if (!block) return;

    if (!Player.getHeldItem()?.getName()?.includes("Dungeonbreaker")) {
      if (settings.autoSwap) setItemSlot(this.dungeonbreakerSlot);
      return;
    }

    this.minedBlocks.set(block.join(","), Date.now());
    nukeBlock(block);
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

  handleC07(packet) {
    if (!this.inDungeon || !Player.getHeldItem()?.getName()?.includes("Dungeonbreaker")) return;
    const action = packet.func_180762_c().toString(); // getAction
    if (action === "START_DESTROY_BLOCK") {
      const pos = packet.func_179715_a(); // getPosition
      const x = pos.func_177958_n(); // getX
      const y = pos.func_177956_o(); // getY
      const z = pos.func_177952_p(); // getZ
      if (this.editMode) {
        this.addBlockAtPosition([x, y, z]);
        return;
      }
      if (settings.globalPingless) {
        World.getWorld().func_175698_g(new BP(x, y, z)); // ghostblock
      }
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
    switch (subcommand.toLowerCase()) {
      case "settings":
        Settings.openGUI();
        break;
      case "edit":
        this.toggleEdit();
        break;
      case "debug":
        this.debugDump();
        break;
      case "clearblocks":
        this.clearBlocks();
        break;
      case "listblocks":
        this.listBlocks();
        break;
      default:
        this.showHelp();
        break;
    }
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
    ChatLib.chat(`&b  detectedRoom: &7${this.detectedRoom ? "Name: " + this.detectedRoom.name + ", Corner: [" + this.detectedRoom.corner.join(", ") + "], Rotation: " + this.detectedRoom.rotation : "null"}`);
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
    if (!this.detectedRoom || !this.detectedRoom.name) return ChatLib.chat(`&cCannot clear blocks: No current room detected.`);
    const roomName = this.detectedRoom.name;
    if (this.roomBlockData.roomBlocks[roomName]) {
      delete this.roomBlockData.roomBlocks[roomName];
      ChatLib.chat(`&aCleared all blocks for room ${roomName}.`);
    } else {
      ChatLib.chat(`&cRoom ${roomName} not found in data.`);
    }
  }

  listBlocks() {
    if (!this.inDungeon) return ChatLib.chat(`&cCannot list blocks: Not in a dungeon.`);
    if (!this.detectedRoom || !this.detectedRoom.name) return ChatLib.chat(`&cCannot list blocks: No current room detected.`);
    const roomName = this.detectedRoom.name;
    const blockList = this.roomBlockData.roomBlocks[roomName];
    if (!blockList || blockList.length === 0) {
      ChatLib.chat(`&eNo blocks stored for room ${roomName}.`);
      return;
    }
    ChatLib.chat(`&aBlocks for room ${roomName}:`);
    blockList.forEach((block) => {
      ChatLib.chat(`&b- [${block.join(", ")}]`);
    });
  }

  addBlockAtPosition(worldPos) {
    if (!this.editMode) return ChatLib.chat(`&cCannot add block: Edit mode is not enabled.`);
    if (!this.inDungeon) return ChatLib.chat(`&cCannot add block: Not in a dungeon.`);
    if (!this.detectedRoom || !this.detectedRoom.name) return ChatLib.chat(`&cCannot add block: No current room detected.`);
    const relativeCoords = worldToRelative(worldPos, this.detectedRoom);
    if (!relativeCoords) {
      ChatLib.chat(`&cFailed to calculate relative coordinates for clicked block.`);
      return;
    }
    const roomName = this.detectedRoom.name;
    const blockCoords = relativeCoords.map(Math.floor);
    if (!this.roomBlockData.roomBlocks[roomName]) {
      this.roomBlockData.roomBlocks[roomName] = [];
    }
    const blockList = this.roomBlockData.roomBlocks[roomName];
    const exists = blockList.some((block) => block[0] === blockCoords[0] && block[1] === blockCoords[1] && block[2] === blockCoords[2]);
    if (!exists) {
      blockList.push(blockCoords);
      ChatLib.chat(`&aAdded block [${blockCoords.join(", ")}] to room ${roomName}`);
    } else {
      ChatLib.chat(`&eBlock already marked at [${blockCoords.join(", ")}]`);
    }
  }

  removeBlockAtPosition(worldPos) {
    if (!this.editMode) return ChatLib.chat(`&cCannot remove block: Edit mode is not enabled.`);
    if (!this.inDungeon) return ChatLib.chat(`&cCannot remove block: Not in a dungeon.`);
    if (!this.detectedRoom || !this.detectedRoom.name) return ChatLib.chat(`&cCannot remove block: No current room detected.`);
    const relativeCoords = worldToRelative(worldPos, this.detectedRoom);
    if (!relativeCoords) {
      ChatLib.chat(`&cFailed to calculate relative coordinates for clicked block.`);
      return;
    }
    const roomName = this.detectedRoom.name;
    if (!this.roomBlockData.roomBlocks[roomName]) return;
    const blockCoords = relativeCoords.map(Math.floor);
    const blockList = this.roomBlockData.roomBlocks[roomName];
    const initialLength = blockList.length;
    this.roomBlockData.roomBlocks[roomName] = blockList.filter((block) => !(block[0] === blockCoords[0] && block[1] === blockCoords[1] && block[2] === blockCoords[2]));
    if (this.roomBlockData.roomBlocks[roomName].length < initialLength) {
      ChatLib.chat(`&cRemoved block [${blockCoords.join(", ")}] from room ${roomName}`);
    } else {
      ChatLib.chat(`&eNo block found at [${blockCoords.join(", ")}]`);
    }
  }
}

// Instantiate the class
new DungeonBreakerExtras();
